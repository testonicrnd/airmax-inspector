/* =====================================================================
   숨은 미니 게임 — "신동준 키우기" (이스터에그)
   하단 푸터의 AIRMAX 글자를 2초 안에 3번 누르면 오른쪽 아래에 작은 창으로 열림.
   대시보드 표를 가리지 않도록 작은 창 + 반투명 전환, Esc 또는 [−]로 즉시 숨기기(보스 키).
   1분 동안 입력이 없으면 자동 저장 후 창을 숨김.

   조작: 업무마다 뜨는 키 순서(방향키/알파벳)를 키보드로 하나씩 입력해서 처리 — 옆에서 보면 키보드로 일하는 모습.
   맞게 이어서 누르면 콤보로 처리량 증가, 틀리면 콤보 초기화. 게임 창에 포커스가 있을 때만 키를 받으므로
   대시보드 입력칸에서 타이핑할 때는 반응하지 않음. 휴대폰은 화면 탭으로 처리.
   실적으로 업무력/커피 수혈(자동 처리)/몰입(크리티컬)을 강화하며 인턴 → 대표로 승진하는 노가다 게임.

   저장: 이 기기(localStorage)에 계속 저장 + GAS "Air Max 게임 DB" 시트에 30초마다/숨기거나 닫을 때 저장
   (GAS가 아직 게임 기능 이전 버전이면 기기에만 저장되고 계속 플레이 가능)
   ===================================================================== */
(function(){
  const LS_STATE='airmax_game_state', LS_PID='airmax_game_pid', LS_POS='airmax_game_dim', LS_XY='airmax_game_xy';
  const SAVE_INTERVAL=30000, BOSS_TIME=30, IDLE_HIDE=60000;
  // 게임이 비활성(숨김/닫힘/페이지 닫힘)일 때 커피 수혈은 10% 효율로, 최대 누적 시간은 야근 강화로 10분부터 5분씩 늘어남
  const OFFLINE_RATE=0.1, OFFLINE_BASE_MIN=10, OFFLINE_STEP_MIN=5;
  const TASKS=['📧','📊','📝','📞','🗂️','📎','🖨️','📑','💻','📋'];
  const TASK_NAMES={'📧':'메일 폭탄','📊':'엑셀 정리','📝':'주간 보고서','📞':'고객 전화','🗂️':'서류 더미','📎':'첨부 누락','🖨️':'프린터 고장','📑':'회의록','💻':'시스템 오류','📋':'점검표 취합'};
  const BOSSES=[['👔','팀장님 결재'],['🧐','부장님 검토'],['📈','분기 실적 보고'],['🏢','본부장 회의'],['💼','대표님 보고']];
  // 레벨 → 직급 (노가다 감성으로 승진 간격이 점점 길어짐)
  const RANKS=[[1,'🧑‍🎓','인턴'],[5,'🧑‍💻','사원'],[12,'🧑‍💼','주임'],[22,'👨‍💼','대리'],[35,'🕴️','과장'],[50,'🎩','차장'],[70,'👑','부장'],[95,'🦸','이사'],[130,'🚀','대표']];
  // 업무 키 — 방향키 + 자주 쓰는 알파벳(한/영 상태와 무관하게 e.code로 판정)
  const KEYS=[['ArrowUp','↑'],['ArrowDown','↓'],['ArrowLeft','←'],['ArrowRight','→'],
    ...'ASDFJKLEIRUWO'.split('').map(c=>['Key'+c,c])];
  const UPGRADES=[
    {key:'atkLv',  icon:'⌨️', name:'업무력',    desc:lv=>`키 1번에 ${fmt(atkOf(lv,st.lv))} 처리`, base:12, grow:1.19, max:999},
    {key:'autoLv', icon:'☕', name:'커피 수혈', desc:lv=>`가만히 있어도 초당 ${fmt(autoDps({...st,autoLv:lv}))} 처리`, base:40, grow:1.23, max:999},
    {key:'critLv', icon:'🔥', name:'몰입',      desc:lv=>`${Math.round(critChance(lv)*100)}% 확률로 3배 처리`, base:90, grow:1.38, max:22},
    {key:'offLv',  icon:'🌙', name:'야근',      desc:lv=>`자리를 비워도 최대 ${fmtMin(offlineCapMin(lv))} 동안 커피 수혈(10%)`, base:60, grow:1.5, max:46},
  ];
  const st0=()=>({v:3,lv:1,exp:0,gold:0,totalGold:0,atkLv:0,autoLv:0,critLv:0,offLv:0,stage:1,kills:0,bossFails:0,keys:0,bestCombo:0,inactiveAt:0,lastSave:Date.now(),created:Date.now()});
  let st=st0(), pid='', nick='', dirty=false, serverOk=null, mon=null, opened=false, ticker=null, saver=null, lastRender=0;
  let seq=[], seqPos=0, combo=0, lastInput=Date.now();

  /* ---------- 숫자/계산 ---------- */
  function fmt(n){
    n=Number(n)||0;
    if(n<1000) return (Math.round(n*10)/10).toLocaleString();
    const u=[['조',1e12],['억',1e8],['만',1e4]];
    for(const [s,v] of u) if(n>=v) return (Math.floor(n/v*10)/10).toLocaleString()+s;
    return Math.floor(n).toLocaleString();
  }
  function atkOf(atkLv,lv){ return (1+atkLv)*(1+(lv-1)*0.04); }
  function autoDps(s){ return (s.autoLv+0.3)*atkOf(s.atkLv,s.lv)*0.35; } // +0.3 — 커피 수혈 전에도 아주 천천히 자동 처리
  function critChance(critLv){ return Math.min(0.05+critLv*0.02,0.5); }
  function comboMult(){ return Math.min(1+combo*0.05,2); }             // 연속 성공마다 +5%, 최대 2배
  function hpOf(stage,boss){ const b=10*Math.pow(1.3,stage-1); return Math.ceil(boss?b*7:b); }
  function rewardOf(stage,boss){ const r=2*Math.pow(1.2,stage-1); return Math.ceil(boss?r*6:r); }
  function expNeed(lv){ return Math.round(8*Math.pow(lv,1.55)); }
  function costOf(u,lv){ return Math.ceil(u.base*Math.pow(u.grow,lv)); }
  function offlineCapMin(offLv){ return OFFLINE_BASE_MIN+OFFLINE_STEP_MIN*offLv; }
  function fmtMin(m){ return m>=60?`${Math.floor(m/60)}시간${m%60?' '+(m%60)+'분':''}`:`${m}분`; }
  function rankOf(lv){ let r=RANKS[0]; RANKS.forEach(x=>{ if(lv>=x[0]) r=x; }); return r; }
  function seqLen(){ return Math.min(4+Math.floor(st.stage/3),10)+(mon&&mon.boss?2:0); } // 단계가 오를수록 키 순서가 길어짐

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
      // 서버 쪽이 더 최근에 저장됐으면 서버 진행을 사용
      if(j.found&&j.state&&(j.state.lastSave||0)>(st.lastSave||0)){ st=Object.assign(st0(),j.state); if(j.nickname) nick=j.nickname; saveLocal(); }
    }catch(e){ serverOk=false; }
  }

  /* ---------- 진행 ---------- */
  function spawn(boss){
    const b=BOSSES[(st.stage-1)%BOSSES.length];
    const e=boss?b[0]:TASKS[Math.floor(Math.random()*TASKS.length)];
    const max=hpOf(st.stage,boss);
    mon={boss,emoji:e,name:boss?b[1]:TASK_NAMES[e],hp:max,max,deadline:boss?Date.now()+BOSS_TIME*1000:0};
    newSeq();
    renderMonster();
  }
  function newSeq(){
    const n=seqLen();
    seq=Array.from({length:n},()=>KEYS[Math.floor(Math.random()*KEYS.length)]);
    seqPos=0;
    renderKeys();
  }
  function hit(dmg,crit,show){
    if(!mon) return;
    mon.hp-=dmg;
    if(show) floatText((crit?'💥':'')+fmt(dmg),crit);
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
  function gainExp(n,quiet){
    st.exp+=n;
    while(st.exp>=expNeed(st.lv)){
      st.exp-=expNeed(st.lv); st.lv++;
      const before=rankOf(st.lv-1), now=rankOf(st.lv);
      if(before[2]!==now[2]&&!quiet) toast(`${now[1]} ${now[2]}(으)로 승진했습니다!`);
    }
  }
  // 한 번 처리 — 키 입력 성공(콤보 배율) 또는 휴대폰 탭
  function work(mult){
    if(!mon) return;
    st.keys++;
    const crit=Math.random()<critChance(st.critLv);
    hit(atkOf(st.atkLv,st.lv)*(crit?3:1)*mult,crit,true);
    for(const id of ['gmMonster','gmHero']){ const m=el(id); if(m){ m.classList.remove('hit'); void m.offsetWidth; m.classList.add('hit'); } }
    render();
  }
  function keyInput(code){
    const want=seq[seqPos];
    if(!want) return false;
    if(code===want[0]){
      combo++; if(combo>st.bestCombo) st.bestCombo=combo;
      seqPos++;
      work(comboMult());
      if(mon&&seqPos>=seq.length){ floatText('✔ 완료',false); newSeq(); } else renderKeys();
    } else {
      combo=0;
      const k=el('gmKeys'); if(k){ k.classList.remove('miss'); void k.offsetWidth; k.classList.add('miss'); }
      renderKeys();
    }
    return true;
  }
  let lastTickAt=0;
  function tick(){
    if(!mon) return;
    const now=Date.now(), dt=Math.min((now-(lastTickAt||now))/1000,5); // 너무 오래 멈췄던 경우는 자리 비움 계산이 처리
    lastTickAt=now;
    hit(autoDps(st)*dt,false,false);
    if(mon&&mon.boss&&Date.now()>mon.deadline){
      st.bossFails++; st.kills=0;
      toast(`⏰ ${mon.name} 실패… 실력을 더 쌓고 다시 도전`);
      spawn(false);
    }
    // 1분 동안 입력이 없으면 저장하고 숨김
    if(isVisible()&&Date.now()-lastInput>IDLE_HIDE) gmHide();
    if(Date.now()-lastRender>200) render();
  }
  function buy(i){
    const u=UPGRADES[i], lv=st[u.key], c=costOf(u,lv);
    if(lv>=u.max||st.gold<c) return;
    st.gold-=c; st[u.key]++; dirty=true; render();
  }
  // 게임이 비활성이던 동안 — 커피 수혈이 10% 효율로 실제로 업무를 처리한 것처럼 계산 (최대 누적 시간은 야근 강화로 늘어남).
  // 업무 건수·실적·경험치·단계까지 반영하고, 결재 보스는 커피만으로 30초 안에 처리될 때만 통과
  function applyOffline(){
    const since=st.inactiveAt||st.lastSave||Date.now();
    st.inactiveAt=0;
    const capMin=offlineCapMin(st.offLv);
    const away=(Date.now()-since)/1000;
    let t=Math.min(away,capMin*60);
    const dps=autoDps(st)*OFFLINE_RATE;
    if(t<10||dps<=0) return;
    const startStage=st.stage, startLv=st.lv;
    let gold=0, tasks=0, guard=0;
    while(t>0&&guard++<200000){
      const boss=st.kills>=10, need=hpOf(st.stage,boss)/dps;
      if(boss&&need>BOSS_TIME){ t-=BOSS_TIME; st.kills=0; continue; } // 커피만으로는 결재를 못 넘김 → 다시 일반 업무
      if(need>t) break;
      t-=need;
      const g=rewardOf(st.stage,boss); gold+=g; tasks++;
      gainExp(boss?st.stage*6:st.stage,true);
      if(boss){ st.stage++; st.kills=0; } else st.kills++;
    }
    if(!tasks) return;
    st.gold+=gold; st.totalGold+=gold; dirty=true;
    const awayText=away/60>capMin?`${fmtMin(Math.round(away/60))} 중 ${fmtMin(capMin)}`:fmtMin(Math.max(1,Math.round(away/60)));
    const extra=(st.stage>startStage?` · ${startStage}→${st.stage}단계`:'')+(rankOf(st.lv)[2]!==rankOf(startLv)[2]?` · ${rankOf(st.lv)[2]} 승진!`:'');
    toast(`☕ 자리 비운 ${awayText} 동안 커피 힘으로 업무 ${tasks.toLocaleString()}건 처리 · 실적 +${fmt(gold)}${extra}`,5000);
  }

  /* ---------- 화면 ---------- */
  function el(id){ return document.getElementById(id); }
  function isVisible(){ const w=el('gmWidget'); return !!w&&w.style.display!=='none'; }
  function hasFocus(){ const w=el('gmWidget'); return !!w&&w.contains(document.activeElement); }
  function buildWidget(){
    if(el('gmWidget')) return;
    const w=document.createElement('div');
    w.id='gmWidget'; w.className='gm-widget'; w.tabIndex=0;
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
    w.addEventListener('pointerdown',()=>{ lastInput=Date.now(); });
    // 제목줄을 끌어서 창 이동 — 위치는 기억해 두고 다음에 열 때 그 자리에. 더블클릭하면 기본 위치(오른쪽 아래)로
    const head=w.querySelector('.gm-head');
    let drag=null;
    head.addEventListener('pointerdown',e=>{
      if(e.target.closest('button')) return;
      const r=w.getBoundingClientRect();
      drag={dx:e.clientX-r.left,dy:e.clientY-r.top};
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    head.addEventListener('pointermove',e=>{ if(drag) placeWidget(e.clientX-drag.dx,e.clientY-drag.dy); });
    const endDrag=()=>{ if(!drag) return; drag=null; const r=w.getBoundingClientRect(); lsSet(LS_XY,{x:Math.round(r.left),y:Math.round(r.top)}); };
    head.addEventListener('pointerup',endDrag); head.addEventListener('pointercancel',endDrag);
    head.addEventListener('dblclick',e=>{ if(e.target.closest('button')) return; lsSet(LS_XY,null); w.style.left=w.style.top=w.style.right=w.style.bottom=''; });
    const xy=lsGet(LS_XY,null);
    if(xy) requestAnimationFrame(()=>placeWidget(xy.x,xy.y));
    w.addEventListener('focusin',renderFocus); w.addEventListener('focusout',()=>setTimeout(renderFocus,0));
  }
  // 창을 (x,y)에 놓되 화면 밖으로 나가지 않게 맞춤
  function placeWidget(x,y){
    const w=el('gmWidget'); if(!w) return;
    const maxX=Math.max(0,window.innerWidth-w.offsetWidth), maxY=Math.max(0,window.innerHeight-w.offsetHeight);
    w.style.left=Math.min(Math.max(0,x),maxX)+'px'; w.style.top=Math.min(Math.max(0,y),maxY)+'px';
    w.style.right='auto'; w.style.bottom='auto';
  }
  window.addEventListener('resize',()=>{ const w=el('gmWidget'); if(w&&w.style.left){ const r=w.getBoundingClientRect(); placeWidget(r.left,r.top); } });
  function renderNick(){
    const guess=(typeof LS_CL_INSPECTOR!=='undefined'&&lsGet(LS_CL_INSPECTOR,''))||'';
    el('gmBody').innerHTML=`
      <div class="gm-intro"><img class="gm-intro-img" src="assets/game/dongjun-face.png" alt=""/>신입 <b>신동준</b>이 입사했습니다.<br>
        화면에 뜨는 키(방향키·알파벳)를 순서대로 눌러 업무를 처리하고, 대표까지 승진시켜 주세요.</div>
      <input class="gm-input" id="gmNick" maxlength="12" placeholder="랭킹에 표시될 닉네임" value="${escHtml(guess)}" onkeydown="if(event.key==='Enter')gmStart()"/>
      <button type="button" class="gm-btn primary" onclick="gmStart()">입사시키기</button>`;
  }
  function renderPlay(){
    el('gmBody').innerHTML=`
      <div class="gm-char"><span class="gm-avatar"><img src="assets/game/dongjun-face.png" alt=""/><i id="gmAvatar"></i></span>
        <div class="gm-char-info"><div id="gmRank"></div><div class="gm-bar"><i id="gmExpBar"></i></div></div></div>
      <div class="gm-stats"><span>💰 <b id="gmGold"></b></span><span id="gmStage"></span><span id="gmDps"></span></div>
      <div class="gm-arena" id="gmArena" onpointerdown="gmTouchTap(event)">
        <img class="gm-hero" id="gmHero" src="assets/game/dongjun.png" alt="" draggable="false"/>
        <div class="gm-task">
          <div class="gm-mon-name" id="gmMonName"></div>
          <div class="gm-monster" id="gmMonster"></div>
          <div class="gm-bar hp"><i id="gmHpBar"></i></div>
          <div class="gm-timer" id="gmTimer"></div>
        </div>
        <div class="gm-float-layer" id="gmFloat"></div>
      </div>
      <div class="gm-keys" id="gmKeys" onpointerdown="gmTouchTap(event)"></div>
      <div class="gm-hint" id="gmFocusHint"></div>
      <div class="gm-ups" id="gmUps"></div>
      <div class="gm-foot"><button type="button" class="gm-link" onclick="gmShowRanking()">🏆 랭킹</button><span id="gmSave"></span></div>`;
    render(); renderMonster(); renderKeys(); renderFocus();
  }
  function renderKeys(){
    const k=el('gmKeys'); if(!k) return;
    k.innerHTML=seq.map((x,i)=>`<span class="gm-key${i<seqPos?' done':i===seqPos?' now':''}">${x[1]}</span>`).join('')+
      (combo>1?`<span class="gm-combo">${combo} 콤보 ×${comboMult().toFixed(2)}</span>`:'');
  }
  function isTouchDevice(){ return window.matchMedia('(pointer:coarse)').matches||(typeof isMobile==='function'&&isMobile()); }
  function renderFocus(){
    const h=el('gmFocusHint'); if(!h) return;
    if(isTouchDevice()){ h.textContent='👆 화면을 탭해서 업무를 처리하세요'; h.classList.add('on'); return; }
    const on=hasFocus();
    h.textContent=on?'⌨ 키보드 입력 중 — 위 키를 순서대로 누르세요':'창을 한 번 클릭하면 키보드로 처리할 수 있습니다';
    h.classList.toggle('on',on);
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
    d.style.left=(45+Math.random()*35)+'%';
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
    if(!nick){ renderNick(); el('gmNick')?.focus(); return; }
    startPlay();
  }
  function startPlay(){
    applyOffline();
    spawn(st.kills>=10);
    renderPlay();
    el('gmWidget').focus();
    startLoops();
  }
  function startLoops(){
    clearInterval(ticker); clearInterval(saver);
    lastTickAt=Date.now();
    ticker=setInterval(tick,100);
    saver=setInterval(()=>saveServer(false),SAVE_INTERVAL);
  }
  function stopLoops(){ clearInterval(ticker); clearInterval(saver); ticker=saver=null; }
  window.gmStart=function(){
    const v=(el('gmNick').value||'').trim().slice(0,12);
    if(!v){ el('gmNick').focus(); return; }
    nick=v; dirty=true; saveServer(true); startPlay();
  };
  // 휴대폰은 키보드 대신 화면 탭으로 처리 (PC 마우스 클릭은 처리하지 않음 — 키보드로 플레이)
  // 휴대폰(터치 화면)은 키보드 대신 탭 — 업무 영역이나 키 표시를 탭하면 지금 눌러야 할 키를 맞게 누른 것으로 처리(콤보 포함).
  // PC 마우스 클릭은 처리하지 않음(사무실 클릭 소리 방지, 키보드로 플레이)
  window.gmTouchTap=function(e){
    if(!(isTouchDevice()||e.pointerType==='touch'||e.pointerType==='pen')) return;
    e.preventDefault();
    lastInput=Date.now();
    if(seq[seqPos]) keyInput(seq[seqPos][0]);
  };
  window.gmBuy=buy;
  window.gmShowRanking=gmShowRanking;
  window.gmBack=function(){ renderPlay(); el('gmWidget').focus(); };
  window.gmShow=function(){
    el('gmWidget').style.display=''; el('gmChip').style.display='none'; lastInput=Date.now();
    // 숨겨져 있던 동안의 커피 수혈(10%)을 반영하고 다시 진행
    if(mon&&!ticker){ applyOffline(); render(); startLoops(); }
    if(el('gmKeys')) el('gmWidget').focus();
  };
  window.gmHide=function(){
    const w=el('gmWidget'); if(!w) return;
    if(w.contains(document.activeElement)) document.activeElement.blur();
    w.style.display='none'; el('gmChip').style.display=opened?'':'none'; combo=0;
    // 숨기면 진행을 멈추고, 다시 열 때 비활성 시간만큼 10% 효율로 계산
    if(mon){ stopLoops(); st.inactiveAt=Date.now(); }
    saveServer(true);
  };
  window.gmClose=function(){
    if(mon) st.inactiveAt=Date.now();
    saveServer(true);
    stopLoops(); opened=false; mon=null;
    el('gmWidget').remove(); el('gmChip').remove();
  };
  window.gmToggleDim=function(){ const w=el('gmWidget'); w.classList.toggle('dim'); lsSet(LS_POS,w.classList.contains('dim')); };

  // 키보드 — 게임 창에 포커스가 있을 때만(대시보드 입력칸 타이핑과 섞이지 않게). Esc는 보스 키
  document.addEventListener('keydown',e=>{
    if(!opened||!isVisible()) return;
    if(e.key==='Escape'){ gmHide(); return; }
    if(!hasFocus()||e.target.tagName==='INPUT') return;
    if(e.ctrlKey||e.metaKey||e.altKey||e.repeat) return;
    lastInput=Date.now();
    if(KEYS.some(k=>k[0]===e.code)||/^Key[A-Z]$/.test(e.code)){ e.preventDefault(); keyInput(e.code); }
  });
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
