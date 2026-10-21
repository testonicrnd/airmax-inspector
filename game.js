/* =====================================================================
   숨은 미니 게임 — "신동준 키우기" (이스터에그)
   하단 푸터의 AIRMAX 글자를 2초 안에 3번 누르면 오른쪽 아래에 작은 창으로 열림.
   대시보드 표를 가리지 않도록 작은 창 + 반투명 전환, Esc 또는 [−]로 즉시 숨기기(보스 키).
   몰려드는 업무를 탭해서 처리 → 실적 획득 → 업무력/커피 수혈/몰입 강화 → 승진하는 노가다 게임.
   저장: 이 기기(localStorage)에 계속 저장 + GAS "Air Max 게임 DB" 시트에 30초마다/닫을 때 저장
   (GAS가 아직 게임 기능 이전 버전이면 기기에만 저장되고 계속 플레이 가능)
   ===================================================================== */
(function(){
  const LS_STATE='airmax_game_state', LS_PID='airmax_game_pid', LS_POS='airmax_game_dim';
  const SAVE_INTERVAL=30000, OFFLINE_CAP=8*3600, BOSS_TIME=30;
  const TASKS=['📧','📊','📝','📞','🗂️','📎','🖨️','📑','💻','📋'];
  const TASK_NAMES={'📧':'메일 폭탄','📊':'엑셀 정리','📝':'주간 보고서','📞':'고객 전화','🗂️':'서류 더미','📎':'첨부 누락','🖨️':'프린터 고장','📑':'회의록','💻':'시스템 오류','📋':'점검표 취합'};
  const BOSSES=[['👔','팀장님 결재'],['🧐','부장님 검토'],['📈','분기 실적 보고'],['🏢','본부장 회의'],['💼','대표님 보고']];
  // 레벨 → 직급 (노가다 감성으로 승진 간격이 점점 길어짐)
  const RANKS=[[1,'🧑‍🎓','인턴'],[5,'🧑‍💻','사원'],[12,'🧑‍💼','주임'],[22,'👨‍💼','대리'],[35,'🕴️','과장'],[50,'🎩','차장'],[70,'👑','부장'],[95,'🦸','이사'],[130,'🚀','대표']];
  const UPGRADES=[
    {key:'atkLv',  icon:'⌨️', name:'업무력',    desc:lv=>`탭 1번에 ${fmt(atkOf(lv,st.lv))} 처리`, base:12, grow:1.19, max:999},
    {key:'autoLv', icon:'☕', name:'커피 수혈', desc:lv=>`가만히 있어도 초당 ${fmt(autoDps({...st,autoLv:lv}))} 처리`, base:40, grow:1.23, max:999},
    {key:'critLv', icon:'🔥', name:'몰입',      desc:lv=>`${Math.round(critChance(lv)*100)}% 확률로 3배 처리`, base:90, grow:1.38, max:22},
  ];
  const st0=()=>({v:1,lv:1,exp:0,gold:0,totalGold:0,atkLv:0,autoLv:0,critLv:0,stage:1,kills:0,bossFails:0,taps:0,lastSave:Date.now(),created:Date.now()});
  let st=st0(), pid='', nick='', dirty=false, serverOk=null, mon=null, opened=false, ticker=null, saver=null, lastRender=0;

  /* ---------- 숫자/계산 ---------- */
  function fmt(n){
    n=Number(n)||0;
    if(n<1000) return (Math.round(n*10)/10).toLocaleString();
    const u=[['조',1e12],['억',1e8],['만',1e4]];
    for(const [s,v] of u) if(n>=v) return (Math.floor(n/v*10)/10).toLocaleString()+s;
    return Math.floor(n).toLocaleString();
  }
  function atkOf(atkLv,lv){ return (1+atkLv)*(1+(lv-1)*0.04); }
  function autoDps(s){ return s.autoLv*atkOf(s.atkLv,s.lv)*0.35; }
  function critChance(critLv){ return Math.min(0.05+critLv*0.02,0.5); }
  function hpOf(stage,boss){ const b=10*Math.pow(1.3,stage-1); return Math.ceil(boss?b*7:b); }
  function rewardOf(stage,boss){ const r=2*Math.pow(1.2,stage-1); return Math.ceil(boss?r*6:r); }
  function expNeed(lv){ return Math.round(8*Math.pow(lv,1.55)); }
  function costOf(u,lv){ return Math.ceil(u.base*Math.pow(u.grow,lv)); }
  function rankOf(lv){ let r=RANKS[0]; RANKS.forEach(x=>{ if(lv>=x[0]) r=x; }); return r; }

  /* ---------- 저장 ---------- */
  function newPid(){ const a=new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a,b=>b.toString(16).padStart(2,'0')).join(''); }
  function loadLocal(){
    pid=lsGet(LS_PID,'')||''; if(!pid){ pid=newPid(); lsSet(LS_PID,pid); }
    const saved=lsGet(LS_STATE,null);
    if(saved&&saved.state){ st=Object.assign(st0(),saved.state); nick=saved.nick||''; }
  }
  function saveLocal(){ st.lastSave=Date.now(); lsSet(LS_STATE,{state:st,nick}); }
  async function gas(payload){
    if(typeof GAS_URL==='undefined'||!GAS_URL) throw new Error('no gas');
    const res=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)});
    return JSON.parse(await res.text());
  }
  async function saveServer(force){
    saveLocal();
    if(!nick||(!dirty&&!force)) return;
    dirty=false;
    try{
      const j=await gas({action:'gameSave',playerId:pid,nickname:nick,state:JSON.stringify(st)});
      serverOk=!!j.success;
    }catch(e){ serverOk=false; }
    renderSaveState();
  }
  async function loadServer(){
    try{
      const j=await gas({action:'gameLoad',playerId:pid});
      if(!j.success){ serverOk=false; return; }
      serverOk=true;
      // 서버 쪽이 더 최근에 저장됐으면(다른 날 같은 기기 등) 서버 진행을 사용
      if(j.found&&j.state&&(j.state.lastSave||0)>(st.lastSave||0)){ st=Object.assign(st0(),j.state); if(j.nickname) nick=j.nickname; saveLocal(); }
    }catch(e){ serverOk=false; }
  }

  /* ---------- 진행 ---------- */
  function spawn(boss){
    const b=BOSSES[(st.stage-1)%BOSSES.length];
    const e=boss?b[0]:TASKS[Math.floor(Math.random()*TASKS.length)];
    const max=hpOf(st.stage,boss);
    mon={boss,emoji:e,name:boss?b[1]:TASK_NAMES[e],hp:max,max,deadline:boss?Date.now()+BOSS_TIME*1000:0};
    renderMonster();
  }
  function hit(dmg,crit,fromTap){
    if(!mon) return;
    mon.hp-=dmg;
    if(fromTap) floatText((crit?'💥':'')+fmt(dmg),crit);
    if(mon.hp<=0) defeat();
    dirty=true;
  }
  function defeat(){
    const g=rewardOf(st.stage,mon.boss);
    st.gold+=g; st.totalGold+=g;
    gainExp(mon.boss?st.stage*6:st.stage);
    if(mon.boss){ st.stage++; st.kills=0; st.bossFails=0; toast(`🎉 ${mon.name} 통과! ${st.stage}단계로`); }
    else st.kills++;
    spawn(st.kills>=10);
  }
  function gainExp(n){
    st.exp+=n;
    while(st.exp>=expNeed(st.lv)){
      st.exp-=expNeed(st.lv); st.lv++;
      const before=rankOf(st.lv-1), now=rankOf(st.lv);
      if(before[2]!==now[2]) toast(`${now[1]} ${now[2]}(으)로 승진했습니다!`);
    }
  }
  function tap(){
    if(!mon) return;
    st.taps++;
    const crit=Math.random()<critChance(st.critLv);
    hit(atkOf(st.atkLv,st.lv)*(crit?3:1),crit,true);
    const m=document.getElementById('gmMonster'); if(m){ m.classList.remove('hit'); void m.offsetWidth; m.classList.add('hit'); }
    render();
  }
  function tick(){
    if(!mon) return;
    const dps=autoDps(st);
    if(dps>0) hit(dps*0.1,false,false);
    if(mon&&mon.boss&&Date.now()>mon.deadline){
      st.bossFails++; st.kills=0;
      toast(`⏰ ${mon.name} 실패… 실력을 더 쌓고 다시 도전`);
      spawn(false);
    }
    if(Date.now()-lastRender>200) render();
  }
  function buy(i){
    const u=UPGRADES[i], lv=st[u.key], c=costOf(u,lv);
    if(lv>=u.max||st.gold<c) return;
    st.gold-=c; st[u.key]++; dirty=true; render();
  }
  // 자리를 비운 동안 — 커피 수혈(자동 처리)로 쌓인 실적의 절반을 보상 (최대 8시간)
  function offlineReward(){
    const secs=Math.min((Date.now()-(st.lastSave||Date.now()))/1000,OFFLINE_CAP);
    const dps=autoDps(st);
    if(secs<60||dps<=0) return;
    const done=dps*secs/hpOf(st.stage,false);
    const g=Math.floor(done*rewardOf(st.stage,false)*0.5);
    if(g>0){ st.gold+=g; st.totalGold+=g; dirty=true; toast(`☕ 자리를 비운 동안 커피 힘으로 실적 ${fmt(g)} 처리!`,4000); }
  }

  /* ---------- 화면 ---------- */
  function el(id){ return document.getElementById(id); }
  function buildWidget(){
    if(el('gmWidget')) return;
    const w=document.createElement('div');
    w.id='gmWidget'; w.className='gm-widget';
    w.innerHTML=`
      <div class="gm-head">
        <span class="gm-title">신동준 키우기</span>
        <span class="gm-head-btns">
          <button type="button" title="반투명" onclick="gmToggleDim()">◐</button>
          <button type="button" title="숨기기 (Esc)" onclick="gmHide()">−</button>
          <button type="button" title="닫기" onclick="gmClose()">×</button>
        </span>
      </div>
      <div class="gm-body" id="gmBody"></div>`;
    document.body.appendChild(w);
    const chip=document.createElement('button');
    chip.id='gmChip'; chip.className='gm-chip'; chip.type='button'; chip.title='신동준 키우기'; chip.textContent='☕';
    chip.onclick=()=>gmShow();
    document.body.appendChild(chip);
    if(lsGet(LS_POS,false)) w.classList.add('dim');
  }
  function renderNick(){
    const guess=(typeof LS_CL_INSPECTOR!=='undefined'&&lsGet(LS_CL_INSPECTOR,''))||'';
    el('gmBody').innerHTML=`
      <div class="gm-intro">🧑‍🎓 신입 <b>신동준</b>이 입사했습니다.<br>업무를 처리하고 실적을 쌓아 대표까지 승진시켜 주세요.</div>
      <input class="gm-input" id="gmNick" maxlength="12" placeholder="랭킹에 표시될 닉네임" value="${escHtml(guess)}"/>
      <button type="button" class="gm-btn primary" onclick="gmStart()">입사시키기</button>`;
  }
  function renderPlay(){
    el('gmBody').innerHTML=`
      <div class="gm-char"><span class="gm-avatar" id="gmAvatar"></span>
        <div class="gm-char-info"><div id="gmRank"></div><div class="gm-bar"><i id="gmExpBar"></i></div></div></div>
      <div class="gm-stats"><span>💰 <b id="gmGold"></b></span><span id="gmStage"></span><span id="gmDps"></span></div>
      <button type="button" class="gm-arena" id="gmArena" onpointerdown="gmTap(event)">
        <div class="gm-mon-name" id="gmMonName"></div>
        <div class="gm-monster" id="gmMonster"></div>
        <div class="gm-bar hp"><i id="gmHpBar"></i></div>
        <div class="gm-timer" id="gmTimer"></div>
        <div class="gm-float-layer" id="gmFloat"></div>
      </button>
      <div class="gm-ups" id="gmUps"></div>
      <div class="gm-foot"><button type="button" class="gm-link" onclick="gmShowRanking()">🏆 랭킹</button><span id="gmSave"></span></div>`;
    render(); renderMonster();
  }
  function renderMonster(){
    if(!mon||!el('gmMonster')) return;
    el('gmMonster').textContent=mon.emoji;
    el('gmMonName').textContent=(mon.boss?'⚠ 보스 · ':'')+mon.name;
    el('gmArena').classList.toggle('boss',mon.boss);
  }
  function render(){
    lastRender=Date.now();
    if(!el('gmGold')) return;
    const r=rankOf(st.lv);
    el('gmAvatar').textContent=r[1];
    el('gmRank').innerHTML=`<b>${r[2]} 신동준</b> · Lv.${st.lv} <span class="gm-nick">${escHtml(nick)}</span>`;
    el('gmExpBar').style.width=Math.min(100,st.exp/expNeed(st.lv)*100)+'%';
    el('gmGold').textContent=fmt(st.gold);
    el('gmStage').textContent=`📂 ${st.stage}단계 ${mon&&mon.boss?'보스':st.kills+'/10'}`;
    el('gmDps').textContent=`☕ 초당 ${fmt(autoDps(st))}`;
    if(mon){
      el('gmHpBar').style.width=Math.max(0,mon.hp/mon.max*100)+'%';
      el('gmTimer').textContent=mon.boss?`⏱ ${Math.max(0,Math.ceil((mon.deadline-Date.now())/1000))}초`:'';
    }
    el('gmUps').innerHTML=UPGRADES.map((u,i)=>{
      const lv=st[u.key], c=costOf(u,lv), maxed=lv>=u.max;
      return `<button type="button" class="gm-up" ${maxed||st.gold<c?'disabled':''} onclick="gmBuy(${i})">
        <span class="gm-up-icon">${u.icon}</span>
        <span class="gm-up-text"><b>${u.name} Lv.${lv}</b><small>${maxed?'':'다음: '}${u.desc(lv+(maxed?0:1))}</small></span>
        <span class="gm-up-cost">${maxed?'MAX':'💰'+fmt(c)}</span></button>`;
    }).join('');
    renderSaveState();
  }
  function renderSaveState(){
    const s=el('gmSave'); if(!s) return;
    s.textContent=serverOk===false?'기기에만 저장 중':(serverOk?'자동 저장됨':'');
  }
  function floatText(text,crit){
    const layer=el('gmFloat'); if(!layer) return;
    const d=document.createElement('span');
    d.className='gm-float'+(crit?' crit':'');
    d.textContent=text;
    d.style.left=(30+Math.random()*40)+'%';
    layer.appendChild(d);
    setTimeout(()=>d.remove(),700);
  }
  function toast(text,ms){
    const w=el('gmWidget'); if(!w) return;
    const t=document.createElement('div');
    t.className='gm-toast'; t.textContent=text;
    w.appendChild(t);
    setTimeout(()=>t.remove(),ms||2200);
  }
  async function gmShowRanking(){
    el('gmBody').innerHTML='<div class="gm-intro">랭킹 불러오는 중…</div>';
    let html='';
    try{
      const j=await gas({action:'gameRanking',playerId:pid});
      if(!j.success) throw new Error(j.error);
      html=`<div class="gm-rank-title">🏆 승진 랭킹 <small>(${j.players}명)</small></div>`+
        j.top.map((x,i)=>`<div class="gm-rank-row${x.me?' me':''}"><span>${i+1}</span><b>${escHtml(x.nickname)}</b><span>${rankOf(x.level)[2]} · ${x.stage}단계</span></div>`).join('')+
        (j.myRank>10?`<div class="gm-rank-row me"><span>${j.myRank}</span><b>${escHtml(nick)}</b><span>나</span></div>`:'');
    }catch(e){ html='<div class="gm-intro">랭킹을 불러오지 못했습니다. (서버에 게임 기능이 아직 없거나 네트워크 문제)</div>'; }
    el('gmBody').innerHTML=html+'<button type="button" class="gm-btn" onclick="gmBack()">돌아가기</button>';
  }

  /* ---------- 열기/닫기 ---------- */
  async function gmOpen(){
    buildWidget();
    if(opened){ gmShow(); return; }
    opened=true;
    loadLocal();
    gmShow();
    await loadServer();
    if(!nick){ renderNick(); return; }
    startPlay();
  }
  function startPlay(){
    offlineReward();
    spawn(st.kills>=10);
    renderPlay();
    clearInterval(ticker); clearInterval(saver);
    ticker=setInterval(tick,100);
    saver=setInterval(()=>saveServer(false),SAVE_INTERVAL);
  }
  window.gmStart=function(){
    const v=(el('gmNick').value||'').trim().slice(0,12);
    if(!v){ el('gmNick').focus(); return; }
    nick=v; dirty=true; saveServer(true); startPlay();
  };
  window.gmTap=function(e){ e.preventDefault(); tap(); };
  window.gmBuy=buy;
  window.gmShowRanking=gmShowRanking;
  window.gmBack=function(){ renderPlay(); };
  window.gmShow=function(){ el('gmWidget').style.display=''; el('gmChip').style.display='none'; };
  window.gmHide=function(){ el('gmWidget').style.display='none'; el('gmChip').style.display=opened?'':'none'; saveServer(false); };
  window.gmClose=function(){
    saveServer(true);
    clearInterval(ticker); clearInterval(saver); ticker=saver=null; opened=false; mon=null;
    el('gmWidget').remove(); el('gmChip').remove();
  };
  window.gmToggleDim=function(){ const w=el('gmWidget'); w.classList.toggle('dim'); lsSet(LS_POS,w.classList.contains('dim')); };

  // 보스 키 — Esc로 즉시 숨김
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&opened&&el('gmWidget')&&el('gmWidget').style.display!=='none') gmHide(); });
  // 창을 닫거나 탭을 벗어나면 저장
  document.addEventListener('visibilitychange',()=>{ if(document.hidden&&opened) saveServer(false); });

  // 이스터에그 — 푸터 AIRMAX를 2초 안에 3번
  let taps=[];
  document.addEventListener('click',e=>{
    if(!e.target.closest('.footer-brand')) return;
    const now=Date.now();
    taps=taps.filter(t=>now-t<2000).concat(now);
    if(taps.length>=3){ taps=[]; gmOpen(); }
  });
})();
