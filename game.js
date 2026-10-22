/* =====================================================================
   숨은 미니 게임 — "테스토닉 키우기" (이스터에그)
   하단 푸터의 AIRMAX 글자를 2초 안에 3번 누르면 오른쪽 아래에 작은 창으로 열림.
   대시보드 표를 가리지 않도록 작은 창 + 반투명 전환, Esc 또는 [−]로 즉시 숨기기(보스 키).
   1분 동안 입력이 없으면 자동 저장 후 창을 숨김.

   조작(PC): 업무마다 뜨는 단어(점검 장소·구분·항목·결과 등 짧은 단어)를 입력칸에 치고 Space/Enter — 옆에서 보면 일하는 모습.
   보스(결재)는 단어 여러 개. 맞게 이어서 치면 콤보로 처리량 증가, 틀리면 콤보 초기화. 긴 단어일수록 한 번에 많이 처리.
   휴대폰: 화면 탭(지금 키를 맞게 누른 것으로 처리).
   🪜 무한의 계단: 주임을 달성한 직원이 있으면 열림. ←/→(A/D)로 다음 계단 방향을 맞춰 오르기, 끝나면 층수만큼 경험치(단어 입력보다 낮은 효율).
   최고 층수는 계정별로 저장하고 랭킹을 따로 집계.
   📌 고정: 켜 두면 1분 동안 입력이 없어도 창을 숨기지 않음(다른 탭을 보고 와도 그대로). 탭을 벗어난 동안은 커피 수혈 10%로 계산.
   실적으로 업무력/커피 수혈(자동 처리)/몰입(크리티컬)/성과금(실적 배율)/야근을 강화하며 인턴 → 사장으로 승진하는 노가다 게임.
   캐릭터: 신동준으로 시작, 직원 한 명을 사장까지 키울 때마다 원하는 직원 한 명을 입사시킬 수 있음.
   늦게 입사한 직원일수록(입사 순서 기준) 업무량·승진 경험치가 많아 더 어려움.
   캐릭터마다 진행(실적·강화·단계)은 따로.

   계정: 닉네임(중복 불가) + PIN 숫자 4~6자리. 처음 쓰는 닉네임이면 가입, 이미 있으면 PIN이 맞을 때 이어하기(다른 기기에서도).
   저장: 이 기기(localStorage)에 계속 저장 + GAS "Air Max 게임 DB" 시트에 30초마다/숨기거나 닫을 때 저장(로그인 토큰으로 확인)
   ===================================================================== */
(function(){
  // 닉네임+PIN 계정으로 바꾸면서 저장 키를 새로 씀 — 예전(닉네임만) 기기 저장은 이어받지 않고 새로 시작(랭킹 초기화와 함께)
  const LS_STATE='airmax_game_state3', LS_ACCT='airmax_game_acct', LS_POS='airmax_game_dim', LS_XY='airmax_game_xy', LS_LOCK='airmax_game_lock';
  const SAVE_INTERVAL=30000, BOSS_TIME=30, IDLE_HIDE=60000;
  // 게임이 비활성(숨김/닫힘/페이지 닫힘)일 때 커피 수혈은 10% 효율로, 최대 누적 시간은 야근 강화로 10분부터 5분씩 늘어남
  const OFFLINE_RATE=0.1, OFFLINE_BASE_MIN=10, OFFLINE_STEP_MIN=5;
  // 업무 — 사무 업무 + 중소기업에서 흔한(?) 부당 업무
  const TASKS=[['📧','메일 폭탄'],['📊','엑셀 정리'],['📝','주간 보고서'],['📞','고객 전화'],['🗂️','서류 더미'],['📎','첨부 누락'],['🖨️','프린터 고장'],['📑','회의록'],['💻','시스템 오류'],['📋','점검표 취합'],
    ['🐠','어항 청소'],['🪣','어항 물갈기'],['🚗','사장님 차 세차'],['🛍️','사장님 개인 심부름'],['☕','손님 커피 타기'],['🪴','사무실 화분 물주기'],['🧻','화장실 휴지 채우기'],['💧','정수기 물통 교체'],
    ['📦','택배 상하차'],['🧹','퇴근 전 사무실 청소'],['🍽️','탕비실 설거지'],['⛳','사장님 골프 예약'],['🎒','사장님 자녀 숙제'],['🥬','사장님 댁 김장'],['🏠','사장님 댁 이삿짐'],['🎁','명절 선물 포장'],
    ['💐','경조사 대리 참석'],['💡','형광등 교체'],['🅿️','사장님 차 대리 주차'],['🏦','은행 심부름'],['🍻','회식 자리 예약'],['🎤','회식 2차 노래방'],['📅','주말 출근'],['🪑','행사 의자 나르기'],
    ['📸','회사 블로그 사진'],['🐕','사장님 강아지 산책'],['🧾','법인카드 영수증 풀칠'],['🔧','고장 난 의자 수리'],['❄️','에어컨 필터 청소'],['📠','팩스 보내기'],['📱','사장님 휴대폰 설정'],['🚙','거래처 접대 운전']];
  const BOSSES=[['👔','팀장님 결재'],['🧐','부장님 검토'],['📈','분기 실적 보고'],['🏢','본부장 회의'],['👨‍👩‍👧','사장님 가족 행사'],['🧓','회장님 방문'],['💼','사장님 보고']];
  // 레벨 → 직급 (노가다 감성으로 승진 간격이 점점 길어짐). 마지막 '사장'을 달성하면 다음 캐릭터 해금
  const RANKS=[[1,'🧑‍🎓','인턴'],[5,'🧑‍💻','사원'],[12,'🧑‍💼','주임'],[22,'👨‍💼','대리'],[35,'🕴️','과장'],[50,'🎩','차장'],[70,'👑','부장'],[95,'🦸','이사'],[112,'💼','상무이사'],[130,'🎖️','전무이사'],[150,'🚀','사장']];
  const BOSS_LV=RANKS[RANKS.length-1][0]; // 사장 = 만렙(150)
  // 캐릭터 — 신동준 다음은 사장 달성할 때마다 원하는 직원을 골라 입사. 이미지가 없는 캐릭터는 이름으로 대신 표시(이미지는 생기는 대로 추가)
  const CHARS=[{name:'신동준',face:'assets/game/dongjun-face.png',body:'assets/game/dongjun.png'},{name:'신원철',face:'assets/game/wonchul-face.png',body:'assets/game/wonchul.png?v=2'},{name:'강옥남',face:'assets/game/oknam-face.png',body:'assets/game/oknam.png?v=2'},{name:'이용훈',face:'assets/game/yonghun-face.png',body:'assets/game/yonghun.png'},{name:'하문숙',face:'assets/game/munsuk-face.png',body:'assets/game/munsuk.png'},{name:'신원옥',face:'assets/game/wonok-face.png',body:'assets/game/wonok.png?v=2'},{name:'천병석',face:'assets/game/byungsuk-face.png',body:'assets/game/byungsuk.png'},{name:'오찬근',face:'assets/game/changeun-face.png',body:'assets/game/changeun.png'}];
  const HP_STEP=1.6, EXP_STEP=1.12; // 입사 순서(tier)마다 업무량 ×1.6, 승진 경험치 ×1.12
  // PC 단어 입력 — 점검표에서 쓰는 짧은 단어 + 점검 장소/세부구역을 잘게 나눈 단어(2~6글자)를 섞어서 사용
  const WORD_BASE=['매트','집진기','소모품','흡입력','풍속계','풍속','호스','브라켓','연결부','센서','전원','동작상태','표시상태','통신상태','모뎀',
    '먼지봉투','헤파필터','필터','모터','사용률','교체','정상','이상','정기','수시','긴급','점검자','점검일자','특이사항','실시','미실시','측정',
    '육안','시연','점등','신형로고','구형로고','서명','직인','점검표','에어맥스','클린매트','테스토닉','세부구역','업체명','설치장소','흡입상태',
    '볼복귀','스프링','외관','청소','먼지','포집','누적','가동','가동시간','점검구분','소모품교체','제품종류','담당자','확인자'];
  const WORD_MIN=2, WORD_MAX=6, BOSS_WORDS=3;
  let words=WORD_BASE.slice();
  // 점검표에 오타로 올라간 장소 단어 고치기 (시트를 고쳐도 남아 있는 기록이 있을 수 있어서)
  const WORD_FIX={'운동잠현관':'운동장현관','운동잠':'운동장','중앙혀관':'중앙현관','혀관':'현관'};
  function placeWords(list){
    const out=new Set();
    (list||[]).forEach(p=>[p&&p.name,...((p&&p.areas)||[])].forEach(t=>String(t||'').split(/[\s()\[\]{}·,.\/\-_~!?:;'"]+/).forEach(w=>{
      w=WORD_FIX[w]||w;
      if(w.length>=WORD_MIN&&w.length<=WORD_MAX&&/[가-힣]/.test(w)&&!/^\d/.test(w)) out.add(w);
    })));
    return [...out];
  }
  function setWords(list){ words=[...new Set(WORD_BASE.concat(placeWords(list)))]; }
  // 기기에 저장된 장소 목록으로 먼저 만들고, 게임을 열 때마다 서버의 최신 목록(시트에서 고친 내용 포함)으로 다시 만듦
  function refreshWords(){
    let list=[];
    try{ list=(typeof clPlaces!=='undefined'&&clPlaces.length)?clPlaces:(lsGet('airmax_checklist_places',[])||[]); }catch(e){}
    setWords(list);
    gas({action:'getChecklistPlaces'}).then(j=>{
      if(!j||!j.success||!Array.isArray(j.places)) return;
      setWords(j.places);
      lsSet('airmax_checklist_places',j.places); // 점검표 장소 목록 캐시도 최신으로
      try{ if(typeof clPlaces!=='undefined') clPlaces=j.places; }catch(e){}
      // 지금 화면의 단어가 고쳐진 단어 목록에 없으면(오타 등) 새 단어로
      if(usingWords()&&typeof seq[seqPos]==='string'&&!words.includes(seq[seqPos])){ seq[seqPos]=words[Math.floor(Math.random()*words.length)]; renderKeys(); }
    }).catch(()=>{});
  }
  function usingWords(){ return !isTouchDevice(); }
  // 휴대폰 탭용 키 — 방향키 + 알파벳
  const KEYS=[['ArrowUp','↑'],['ArrowDown','↓'],['ArrowLeft','←'],['ArrowRight','→'],
    ...'ASDFJKLEIRUWO'.split('').map(c=>['Key'+c,c])];
  // 강화 — 비용은 완만하게 오르고, 업무력은 25레벨마다 2배 보너스. 몰입은 97레벨에 크리티컬 100%.
  // req: 이 레벨(직급)이 되어야 열리는 스킬. 화면은 4칸 타일, 설명은 타일의 ?에 마우스를 올리면(휴대폰은 탭) 표시
  const UPGRADES=[
    {key:'atkLv',   icon:'⌨️', name:'업무력',      desc:lv=>`${usingWords()?'1글자에':'키 1번에'} ${fmt(power({...st,atkLv:lv})*(usingWords()?1.3:1))} 처리${lv%25===0?' (2배 보너스!)':''}`, base:10, grow:1.08, max:9999},
    {key:'autoLv',  icon:'☕', name:'커피 수혈',   desc:lv=>`가만히 있어도 초당 ${fmt(autoDps({...st,autoLv:lv}))} 처리`, base:30, grow:1.09, max:9999},
    {key:'critLv',  icon:'🔥', name:'몰입',        desc:lv=>`${Math.round(critChance(lv)*100)}% 확률로 3배 처리`, base:60, grow:1.11, max:97},
    {key:'bonusLv', icon:'💸', name:'성과금 수령', desc:lv=>`받는 실적 ×${goldMult(lv).toFixed(2)}`, base:150, grow:1.15, max:9999},
    {key:'offLv',   icon:'🌙', name:'야근',        desc:lv=>`자리를 비워도 최대 ${fmtMin(offlineCapMin(lv))} 동안 커피 수혈(${Math.round(offRate(st.payLv)*100)}%)`, base:60, grow:1.3, max:46},
    {key:'extLv',   icon:'⏳', name:'결재 연장',   desc:lv=>`보스(결재) 제한 시간 ${BOSS_TIME+2*lv}초`, base:300, grow:1.4, max:15, req:12},
    {key:'mastLv',  icon:'🧠', name:'숙련',        desc:lv=>`업무력 효과 +${lv*10}%`, base:500, grow:1.25, max:9999, req:22},
    {key:'cafLv',   icon:'🫖', name:'카페인 중독', desc:lv=>`커피 수혈 효과 +${lv*10}%`, base:500, grow:1.25, max:9999, req:22},
    {key:'focusLv', icon:'🔗', name:'집중력',      desc:lv=>`콤보 최대 ×${(2+0.1*lv).toFixed(1)}`, base:1500, grow:1.3, max:20, req:35},
    {key:'awakeLv', icon:'⚡', name:'각성',        desc:lv=>`커피 수혈도 ${lv}% 확률로 3배 처리`, base:2000, grow:1.6, max:10, req:35},
    {key:'projLv',  icon:'🏆', name:'프로젝트 달성', desc:lv=>`${(projChance(lv)*100).toFixed(1)}% 확률로 20배 처리 (크리티컬 상위)`, base:5000, grow:1.35, max:20, req:50},
    {key:'payLv',   icon:'🌃', name:'야근 수당',   desc:lv=>`자리 비운 동안 커피 수혈 효율 ${Math.round(offRate(lv)*100)}%`, base:3000, grow:1.35, max:20, req:50},
  ];
  // 저장 구조 — 계정(acc) 안에 캐릭터별 진행(runs). st는 지금 키우는 캐릭터의 진행
  const run0=()=>({lv:1,exp:0,gold:0,totalGold:0,atkLv:0,autoLv:0,critLv:0,bonusLv:0,offLv:0,extLv:0,mastLv:0,cafLv:0,focusLv:0,awakeLv:0,projLv:0,payLv:0,stage:1,kills:0,bossFails:0,keys:0,bestCombo:0,done:false,tier:0});
  // runs는 캐릭터 번호 자리에 저장(입사 안 한 직원은 null)
  const acc0=()=>({v:4,ch:0,runs:[run0()],inactiveAt:0,lastSave:Date.now(),created:Date.now()});
  let acc=acc0(), st=acc.runs[0], pid='', token='', nick='', dirty=false, serverOk=null, mon=null, opened=false, ticker=null, saver=null, lastRender=0;
  let seq=[], seqPos=0, combo=0, lastInput=Date.now(), locked=!!lsGet(LS_LOCK,false);

  /* ---------- 숫자/계산 ---------- */
  function fmt(n){
    n=Number(n)||0;
    if(n<1000) return (Math.round(n*10)/10).toLocaleString();
    const u=[['경',1e16],['조',1e12],['억',1e8],['만',1e4]];
    for(const [s,v] of u) if(n>=v) return (Math.floor(n/v*10)/10).toLocaleString()+s;
    return Math.floor(n).toLocaleString();
  }
  function atkOf(atkLv,lv){ return (1+atkLv)*Math.pow(2,Math.floor(atkLv/25))*(1+(lv-1)*0.03); }
  function power(s){ return atkOf(s.atkLv,s.lv)*(1+0.1*(s.mastLv||0)); } // 업무력 × 숙련
  // 커피 수혈 — +0.3: 강화 전에도 아주 천천히 자동 처리. 카페인 중독으로 증가.
  // 각성은 커피 전용 크리티컬(레벨당 1%, 최대 10%) — 방치만으로 너무 강해지지 않게 직접 플레이 몰입(최대 100%)과 따로 둠
  function autoDps(s){ return (s.autoLv+0.3)*power(s)*0.3*(1+0.1*(s.cafLv||0))*(1+2*0.01*(s.awakeLv||0)); }
  function critChance(critLv){ return Math.min(0.03+critLv*0.01,1); }
  function projChance(projLv){ return Math.min(0.005*projLv,0.1); }
  function offRate(payLv){ return OFFLINE_RATE+0.02*(payLv||0); }
  function bossTime(){ return BOSS_TIME+2*(st.extLv||0); }
  function goldMult(bonusLv){ return 1+bonusLv*0.15; }
  function comboMult(){ return Math.min(1+combo*(usingWords()?0.1:0.05),2+0.1*(st.focusLv||0)); } // 연속 성공마다 +5%(단어는 +10%), 최대 2배(집중력으로 증가)
  function hpOf(stage,boss){ const b=15*Math.pow(1.2,stage-1)*Math.pow(HP_STEP,st.tier); return Math.ceil(boss?b*8:b); }
  function rewardOf(stage,boss){ const r=4*Math.pow(1.17,stage-1)*goldMult(st.bonusLv); return Math.ceil(boss?r*8:r); }
  function expNeed(lv){ return Math.round(10*Math.pow(EXP_STEP,st.tier)*Math.pow(lv,1.6)); }
  function costOf(u,lv){ return Math.ceil(u.base*Math.pow(u.grow,lv)); }
  function offlineCapMin(offLv){ return OFFLINE_BASE_MIN+OFFLINE_STEP_MIN*offLv; }
  function fmtMin(m){ return m>=60?`${Math.floor(m/60)}시간${m%60?' '+(m%60)+'분':''}`:`${m}분`; }
  function rankOf(lv){ let r=RANKS[0]; RANKS.forEach(x=>{ if(lv>=x[0]) r=x; }); return r; }
  function seqLen(){ return Math.min(4+Math.floor(st.stage/3),10)+(mon&&mon.boss?2:0); } // (휴대폰 탭) 단계가 오를수록 키 순서가 길어짐
  function charName(i){ return (CHARS[i]||CHARS[0]).name; }
  function hiredCount(){ return acc.runs.filter(Boolean).length; }
  function doneCount(){ return acc.runs.filter(r=>r&&r.done).length; }
  function canHire(){ return doneCount()>=hiredCount()&&hiredCount()<CHARS.length; } // 사장 달성 수만큼 입사권

  /* ---------- 저장 ---------- */
  // 저장된 값 → 계정 구조. 예전(캐릭터 1명) 저장은 신동준 진행으로 옮김
  function hydrate(raw){
    if(!raw) return acc0();
    if(!Array.isArray(raw.runs)){
      const a=acc0();
      a.runs=[Object.assign(run0(),raw)];
      a.lastSave=raw.lastSave||a.lastSave; a.created=raw.created||a.created; a.inactiveAt=raw.inactiveAt||0;
      return a;
    }
    const a=Object.assign(acc0(),raw);
    a.runs=raw.runs.map(r=>r?Object.assign(run0(),r):null);
    if(!a.runs[0]) a.runs[0]=run0();
    if(!a.runs[a.ch]) a.ch=0;
    return a;
  }
  function useAcc(a){ acc=a; st=acc.runs[acc.ch]; }
  // 랭킹용 요약 — 가장 뒤 캐릭터의 단계·레벨
  function summarize(){
    let top=0; acc.runs.forEach((r,i)=>{ if(r&&r.tier>=acc.runs[top].tier) top=i; });
    const r=acc.runs[top];
    acc.top=top; acc.tier=r.tier; acc.stage=r.stage; acc.lv=r.lv;
    acc.totalGold=acc.runs.reduce((s,x)=>s+(x?x.totalGold:0),0);
  }
  function loadLocal(){
    const a=lsGet(LS_ACCT,null)||{};
    pid=a.pid||''; token=a.token||''; nick=a.nick||'';
    const saved=lsGet(LS_STATE,null);
    useAcc(saved&&saved.state&&saved.pid===pid&&pid?hydrate(saved.state):acc0());
  }
  function saveLocal(){ if(!pid) return; acc.lastSave=Date.now(); summarize(); lsSet(LS_STATE,{state:acc,pid}); }
  function setAccount(a){
    pid=a?a.pid:''; token=a?a.token:''; nick=a?a.nick:'';
    lsSet(LS_ACCT,a);
  }
  // 서버가 토큰을 거부(랭킹 초기화로 계정이 없어졌거나 다른 계정) → 로그인 화면으로
  function authLost(){
    setAccount(null); stopLoops(); mon=null; useAcc(acc0());
    if(el('gmBody')){ renderNick(); setLoginMsg('다시 로그인해주세요.'); }
  }
  async function gas(payload){
    if(typeof GAS_URL==='undefined'||!GAS_URL) throw new Error('no gas');
    const ctl=typeof AbortController!=='undefined'?new AbortController():null;
    const timer=ctl?setTimeout(()=>ctl.abort(),15000):0;
    try{
      const res=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload),signal:ctl?ctl.signal:undefined});
      return JSON.parse(await res.text());
    }finally{ clearTimeout(timer); }
  }
  async function saveServer(force){
    saveLocal();
    if(!pid||!token||(!dirty&&!force)) return;
    dirty=false;
    try{
      const j=await gas({action:'gameSave',playerId:pid,token,state:JSON.stringify(acc)});
      if(j.auth===false){ authLost(); return; }
      serverOk=!!j.success;
    }catch(e){ serverOk=false; }
    renderSaveState();
  }
  async function loadServer(){
    try{
      if(!pid||!token) return;
      const j=await gas({action:'gameLoad',playerId:pid,token});
      if(j.auth===false){ authLost(); return false; }
      if(!j.success){ serverOk=false; return false; }
      serverOk=true;
      // 서버 쪽이 더 최근에 저장됐으면(다른 기기에서 플레이) 서버 진행을 사용
      if(j.found&&j.state&&(j.state.lastSave||0)>(acc.lastSave||0)){ useAcc(hydrate(j.state)); saveLocal(); return true; }
    }catch(e){ serverOk=false; }
    renderSaveState();
    return false;
  }

  /* ---------- 진행 ---------- */
  function spawn(boss){
    const b=BOSSES[(st.stage-1)%BOSSES.length];
    const t=boss?b:TASKS[Math.floor(Math.random()*TASKS.length)];
    const max=hpOf(st.stage,boss);
    mon={boss,emoji:t[0],name:t[1],hp:max,max,deadline:boss?Date.now()+bossTime()*1000:0};
    newSeq();
    renderMonster();
  }
  function newSeq(){
    if(usingWords()){
      // 일반 업무는 단어 1개, 보스는 여러 개(같은 단어 연속은 피함).
      // 커피 수혈(자동 처리)로 업무가 먼저 끝나도 치고 있던 단어는 바뀌지 않게 — 안 끝난 단어를 새 업무의 첫 단어로 이어감
      const n=mon&&mon.boss?BOSS_WORDS:1;
      const carry=typeof seq[seqPos]==='string'?seq[seqPos]:null;
      seq=carry?[carry]:[];
      while(seq.length<n){ const w=words[Math.floor(Math.random()*words.length)]; if(w!==seq[seq.length-1]||words.length<2) seq.push(w); }
    } else {
      seq=Array.from({length:seqLen()},()=>KEYS[Math.floor(Math.random()*KEYS.length)]);
    }
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
    if(st.lv>=BOSS_LV){ st.lv=BOSS_LV; st.exp=0; } // 만렙 — 경험치는 더 쌓지 않음
    while(st.lv<BOSS_LV&&st.exp>=expNeed(st.lv)){
      st.exp-=expNeed(st.lv); st.lv++;
      if(st.lv>=BOSS_LV) st.exp=0;
      const before=rankOf(st.lv-1), now=rankOf(st.lv);
      if(before[2]!==now[2]&&!quiet) toast(`${now[1]} ${now[2]}(으)로 승진했습니다!`);
    }
    // 사장 달성 → 원하는 직원 한 명 입사권
    if(st.lv>=BOSS_LV&&!st.done){
      st.done=true;
      toast(canHire()?`🚀 ${charName(acc.ch)} 사장 달성! 👥 직원에서 원하는 직원을 한 명 입사시킬 수 있습니다`:`🏆 ${charName(acc.ch)} 사장 달성!`,6000);
    }
  }
  // 한 번 처리 — 키 입력 성공(콤보 배율) 또는 휴대폰 탭
  function work(mult){
    if(!mon) return;
    st.keys++;
    strike(power(st)*mult);
    afterWork();
  }
  // 직접 처리 한 번 — 프로젝트 달성(20배)이 먼저, 아니면 몰입(3배) 판정
  function strike(base){
    if(Math.random()<projChance(st.projLv||0)){ floatText('🏆 프로젝트 달성!',true,true); hit(base*20,true,true); return; }
    const crit=Math.random()<critChance(st.critLv);
    hit(base*(crit?3:1),crit,true);
  }
  function afterWork(){
    for(const id of ['gmMonster','gmHero']){ const m=el(id); if(m){ m.classList.remove('hit'); void m.offsetWidth; m.classList.add('hit'); } }
    render();
  }
  // PC 단어 입력 — 맞으면 단어 글자 수만큼 처리(×1.3, 콤보 배율), 틀리면 콤보 초기화
  function wordInput(typed){
    const want=seq[seqPos];
    if(!want||!typed) return;
    if(typed===want){
      combo++; if(combo>st.bestCombo) st.bestCombo=combo;
      seqPos++;
      st.keys++;
      strike(power(st)*want.length*1.3*comboMult());
      afterWork();
      if(mon&&seqPos>=seq.length){ if(seq.length>1) floatText('✔ 완료',false); newSeq(); } else renderKeys();
    } else {
      combo=0;
      const k=el('gmKeys'); if(k){ k.classList.remove('miss'); void k.offsetWidth; k.classList.add('miss'); }
      renderKeys();
    }
  }
  let enterPending=false;
  function checkTyped(submit){
    const t=el('gmType'); if(!t) return;
    const v=t.value, clean=v.replace(/\s/g,'');
    if(!clean){ if(/\s/.test(v)) t.value=''; return; }
    // Space/Enter를 눌렀을 때만 처리 (단어와 같아졌다고 바로 처리하지 않음 — IME에 따라 조합 중 글자가 확정돼 엔터 없이 넘어가던 문제)
    if(submit||/\s/.test(v)){ wordInput(clean); t.value=''; }
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
    // 1분 동안 입력이 없으면 저장하고 숨김 (📌 고정 중이면 숨기지 않음)
    if(!locked&&isVisible()&&Date.now()-lastInput>IDLE_HIDE) gmHide();
    if(Date.now()-lastRender>200) render();
  }
  function buy(i){
    const u=UPGRADES[i], lv=st[u.key]||0, c=costOf(u,lv);
    if(lv>=u.max||st.gold<c||(u.req&&st.lv<u.req)) return false;
    st.gold-=c; st[u.key]++; dirty=true; render();
    return true;
  }
  // 강화 타일 — 누르면 1번, 꾹 누르고 있으면 돈이 되는 만큼 쭈루룩(점점 빨라짐). 타일이 다시 그려져도 이어지도록 목록 단위로 처리
  let holdTimer=0;
  function holdStop(){ clearTimeout(holdTimer); holdTimer=0; }
  function bindUpgradeHold(box){
    box.addEventListener('pointerdown',e=>{
      const tile=e.target.closest('.gm-tile'); if(!tile||e.target.closest('.gm-tile-q')) return;
      if(e.button>0) return;
      e.preventDefault(); lastInput=Date.now();
      const i=+tile.dataset.i;
      holdStop();
      if(!buy(i)) return;
      let n=0;
      const again=()=>{ if(!buy(i)){ holdStop(); return; } n++; lastInput=Date.now(); holdTimer=setTimeout(again,n<10?90:n<30?50:25); };
      holdTimer=setTimeout(again,380);
    });
  }
  window.addEventListener('pointerup',holdStop);
  window.addEventListener('pointercancel',holdStop);
  window.addEventListener('blur',holdStop);
  // 게임이 비활성이던 동안 — 커피 수혈이 10% 효율로 실제로 업무를 처리한 것처럼 계산 (최대 누적 시간은 야근 강화로 늘어남).
  // 지금 키우는 캐릭터에만 반영. 업무 건수·실적·경험치·단계까지 반영하고, 결재 보스는 커피만으로 30초 안에 처리될 때만 통과
  function applyOffline(){
    const since=acc.inactiveAt||acc.lastSave||Date.now();
    acc.inactiveAt=0;
    const capMin=offlineCapMin(st.offLv);
    const away=(Date.now()-since)/1000;
    let t=Math.min(away,capMin*60);
    const dps=autoDps(st)*offRate(st.payLv);
    if(t<10||dps<=0) return;
    const startStage=st.stage, startLv=st.lv;
    let gold=0, tasks=0, guard=0;
    while(t>0&&guard++<200000){
      const boss=st.kills>=10, need=hpOf(st.stage,boss)/dps;
      if(boss&&need>bossTime()){ t-=bossTime(); st.kills=0; continue; } // 커피만으로는 결재를 못 넘김 → 다시 일반 업무
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
  // 캐릭터 바꾸기 — 입사한 직원끼리는 언제든. 입사 안 한 직원은 입사권이 있을 때 골라서 입사(인턴부터, 입사 순서만큼 어려움)
  function switchChar(i){
    if(i<0||i>=CHARS.length) return;
    if(!acc.runs[i]){
      if(!canHire()) return;
      if(!confirm(`${charName(i)}을(를) 입사시킬까요?\n입사권은 사장 달성 1번에 1명입니다. (업무량 ×${fmt(Math.pow(HP_STEP,hiredCount()))})`)) return;
      acc.runs[i]=Object.assign(run0(),{tier:hiredCount()});
      toast(`🎉 ${charName(i)} 입사! 인턴부터 시작합니다`,3000);
    }
    acc.ch=i; st=acc.runs[i]; combo=0; dirty=true;
    spawn(st.kills>=10);
    renderPlay(); focusPlay();
    saveServer(true);
  }

  /* ---------- 화면 ---------- */
  function el(id){ return document.getElementById(id); }
  function isVisible(){ const w=el('gmWidget'); return !!w&&w.style.display!=='none'; }
  function hasFocus(){ const w=el('gmWidget'); return !!w&&w.contains(document.activeElement); }
  // 캐릭터 얼굴/전신 — 이미지가 없으면 이름(성 뺀 두 글자)으로 대신
  function faceHtml(i){
    const c=CHARS[i]||CHARS[0];
    return c.face?`<img src="${c.face}" alt=""/>`:`<span class="gm-face-ph gm-c${i}">${escHtml(c.name.slice(1))}</span>`;
  }
  function bodyHtml(i){
    const c=CHARS[i]||CHARS[0];
    return c.body?`<img class="gm-hero" id="gmHero" src="${c.body}" alt="" draggable="false"/>`
      :`<div class="gm-hero gm-hero-ph gm-c${i}" id="gmHero"><span>${escHtml(c.name.slice(1))}</span><small>${escHtml(c.name)}</small></div>`;
  }
  function buildWidget(){
    if(el('gmWidget')) return;
    const w=document.createElement('div');
    w.id='gmWidget'; w.className='gm-widget'; w.tabIndex=0;
    w.innerHTML=`
      <div class="gm-head">
        <span class="gm-title">테스토닉 키우기</span>
        <span class="gm-head-btns">
          <button type="button" id="gmLockBtn" title="고정 — 입력이 없어도 창을 숨기지 않음" onclick="gmToggleLock()">📌</button>
          <button type="button" title="반투명" onclick="gmToggleDim()">◐</button>
          <button type="button" title="숨기기 (Esc)" onclick="gmHide()">−</button>
          <button type="button" title="닫기" onclick="gmClose()">×</button>
        </span>
      </div>
      <div class="gm-body" id="gmBody"></div>`;
    document.body.appendChild(w);
    const chip=document.createElement('button');
    chip.id='gmChip'; chip.className='gm-chip'; chip.type='button'; chip.title='테스토닉 키우기'; chip.textContent='☕';
    chip.onclick=()=>gmShow();
    document.body.appendChild(chip);
    if(lsGet(LS_POS,false)) w.classList.add('dim');
    w.classList.toggle('locked',locked);
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
    const guess=nick||(typeof LS_CL_INSPECTOR!=='undefined'&&lsGet(LS_CL_INSPECTOR,''))||'';
    el('gmBody').innerHTML=`
      <div class="gm-intro"><img class="gm-intro-img" src="${CHARS[0].face}" alt=""/><span>테스토닉에 신입 <b>${CHARS[0].name}</b>이 입사했습니다.<br>
        화면에 뜨는 키(방향키·알파벳)를 순서대로 눌러 업무를 처리하고, 사장까지 승진시켜 주세요. 사장이 되면 다음 직원이 입사합니다.</span></div>
      <input class="gm-input" id="gmNick" maxlength="12" placeholder="닉네임 (랭킹에 표시)" autocomplete="off" value="${escHtml(guess)}" onkeydown="if(event.key==='Enter')document.getElementById('gmPin').focus()"/>
      <input class="gm-input" id="gmPin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN 숫자 4~6자리" autocomplete="off" onkeydown="if(event.key==='Enter')gmStart()"/>
      <div class="gm-login-msg" id="gmLoginMsg">처음 쓰는 닉네임이면 새로 입사, 이미 있는 닉네임이면 PIN으로 이어하기</div>
      <button type="button" class="gm-btn primary" id="gmStartBtn" onclick="gmStart()">입사 / 이어하기</button>`;
  }
  function setLoginMsg(text,err){ const m=el('gmLoginMsg'); if(m){ m.textContent=text; m.classList.toggle('err',!!err); } }
  function renderPlay(){
    el('gmBody').innerHTML=`
      <div class="gm-char"><span class="gm-avatar">${faceHtml(acc.ch)}<i id="gmAvatar"></i></span>
        <div class="gm-char-info"><div id="gmRank"></div><div class="gm-bar"><i id="gmExpBar"></i></div></div></div>
      <div class="gm-stats"><span>💸 <b id="gmGold"></b></span><span id="gmStage"></span><span id="gmDps"></span></div>
      <div class="gm-arena" id="gmArena" onpointerdown="gmTouchTap(event)">
        ${bodyHtml(acc.ch)}
        <div class="gm-task">
          <div class="gm-mon-name" id="gmMonName"></div>
          <div class="gm-monster" id="gmMonster"></div>
          <div class="gm-bar hp"><i id="gmHpBar"></i></div>
          <div class="gm-hp-text" id="gmHpText"></div>
          <div class="gm-timer" id="gmTimer"></div>
        </div>
        <div class="gm-float-layer" id="gmFloat"></div>
      </div>
      <div class="gm-keys${usingWords()?' words':''}" id="gmKeys" onpointerdown="gmTouchTap(event)"></div>
      ${usingWords()?'<input class="gm-type" id="gmType" autocomplete="off" spellcheck="false" placeholder="위 단어를 입력하고 Space 또는 Enter"/>':''}
      <div class="gm-hint" id="gmFocusHint"></div>
      <div class="gm-ups" id="gmUps" onmouseleave="gmTipHide()"></div>
      <div class="gm-tip" id="gmTip" style="display:none"></div>
      <div class="gm-foot"><button type="button" class="gm-link" onclick="gmShowRanking()">🏆 랭킹</button><button type="button" class="gm-link" onclick="gmShowChars()">👥 직원</button><button type="button" class="gm-link${stairsUnlocked()?'':' locked'}" onclick="gmShowStairs()">🪜 계단</button><span id="gmSave"></span><button type="button" class="gm-link" onclick="gmLogout()">로그아웃</button></div>`;
    render(); renderMonster(); renderKeys(); renderFocus();
    bindUpgradeHold(el('gmUps'));
    const t=el('gmType');
    if(t){
      t.addEventListener('keydown',e=>{
        lastInput=Date.now();
        if(e.key==='Enter'){
          e.preventDefault();
          // 한글 조합 중에 누른 Enter는 조합이 끝난 뒤(compositionend) 처리
          if(e.isComposing||e.keyCode===229){ enterPending=true; setTimeout(()=>{ if(enterPending){ enterPending=false; checkTyped(true); } },80); } else checkTyped(true);
        }
      });
      t.addEventListener('input',e=>{ lastInput=Date.now(); if(!e.isComposing) checkTyped(false); });
      // 한글 조합이 끝난 뒤(Space/Enter로 마지막 글자 확정) — 값이 반영된 다음에 확인
      t.addEventListener('compositionend',()=>setTimeout(()=>{ const sub=enterPending; enterPending=false; checkTyped(sub); },0));
    }
  }
  function focusPlay(){ const t=el('gmType'); (t||el('gmWidget')).focus(); }
  function renderKeys(){
    const k=el('gmKeys'); if(!k) return;
    k.innerHTML=seq.map((x,i)=>`<span class="gm-key${i<seqPos?' done':i===seqPos?' now':''}">${escHtml(typeof x==='string'?x:x[1])}</span>`).join('')+
      (combo>1?`<span class="gm-combo">${combo} 콤보 ×${comboMult().toFixed(2)}</span>`:'');
  }
  // 터치 화면(휴대폰·태블릿)인지 — 화면 폭이 아니라 입력 장치로 판단(PC 브라우저 창을 좁혀도 PC 방식 유지)
  function isTouchDevice(){ return window.matchMedia('(pointer:coarse)').matches||window.matchMedia('(hover:none)').matches; }
  function renderFocus(){
    const h=el('gmFocusHint'); if(!h) return;
    if(isTouchDevice()){ h.textContent='👆 화면을 탭해서 업무를 처리하세요'; h.classList.add('on'); return; }
    const on=hasFocus();
    h.textContent=on?'⌨ 단어를 입력하고 Space 또는 Enter — 길수록 많이 처리':'입력칸을 클릭하면 단어를 입력할 수 있습니다';
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
    el('gmRank').innerHTML=`<b>${r[2]} ${escHtml(charName(acc.ch))}</b> · Lv.${st.lv}${st.lv>=BOSS_LV?' (MAX)':''} <span class="gm-nick">${escHtml(nick)}</span>`;
    el('gmExpBar').style.width=(st.lv>=BOSS_LV?100:Math.min(100,st.exp/expNeed(st.lv)*100))+'%';
    el('gmGold').textContent=fmt(st.gold);
    el('gmStage').textContent=`📂 ${st.stage}단계 ${mon&&mon.boss?'보스':st.kills+'/10'}`;
    el('gmDps').textContent=`☕ 초당 ${fmt(autoDps(st))}`;
    if(mon){
      el('gmHpBar').style.width=Math.max(0,mon.hp/mon.max*100)+'%';
      el('gmHpText').textContent=`남은 업무 ${fmt(Math.max(0,Math.ceil(mon.hp)))} / ${fmt(mon.max)}`;
      el('gmTimer').textContent=mon.boss?`⏱ ${Math.max(0,Math.ceil((mon.deadline-Date.now())/1000))}초`:'';
    }
    // 강화 타일 — 바뀐 게 있을 때만 다시 그림(누르는 도중에 버튼이 새로 그려져 클릭이 씹히지 않게)
    const ups=UPGRADES.map((u,i)=>{
      const lv=st[u.key]||0, c=costOf(u,lv), maxed=lv>=u.max, locked=u.req&&st.lv<u.req;
      const cls=locked?' locked':maxed?' maxed':st.gold<c?' off':'';
      return `<button type="button" class="gm-tile${cls}" data-i="${i}">
        <span class="gm-tile-q" onmouseenter="gmTip(event,${i},true)" onclick="gmTip(event,${i})">?</span>
        <span class="gm-tile-icon">${locked?'🔒':u.icon}</span>
        <span class="gm-tile-name">${u.name}</span>
        <span class="gm-tile-lv">${locked?rankOf(u.req)[2]+' 달성':'Lv.'+lv}</span>
        <span class="gm-tile-cost">${locked?'':maxed?'MAX':'💸'+fmt(c)}</span></button>`;
    }).join('');
    const box=el('gmUps');
    if(box.dataset.html!==ups){ box.innerHTML=ups; box.dataset.html=ups; }
    if(tipIdx>=0) renderTip();
    renderSaveState();
  }
  // 스킬 설명 말풍선 — 타일 줄 바로 위에 표시
  let tipIdx=-1;
  function renderTip(){
    const tip=el('gmTip'), box=el('gmUps'), w=el('gmWidget');
    if(!tip||!box||tipIdx<0){ if(tip) tip.style.display='none'; return; }
    const u=UPGRADES[tipIdx], lv=st[u.key]||0, maxed=lv>=u.max, locked=u.req&&st.lv<u.req;
    tip.innerHTML=`<b>${u.icon} ${u.name}</b> <span>Lv.${lv}${maxed?' (MAX)':''}</span><br>`+
      (locked?`🔒 ${rankOf(u.req)[2]}(Lv.${u.req}) 달성 시 열림<br>`:'')+
      `현재: ${u.desc(lv)}`+(maxed?'':`<br>다음: ${u.desc(lv+1)}`);
    tip.style.display='';
    const wr=w.getBoundingClientRect(), br=box.getBoundingClientRect();
    tip.style.top=Math.max(4,br.top-wr.top-tip.offsetHeight-6)+'px';
  }
  window.gmTip=function(e,i,hover){
    e.stopPropagation(); if(!hover) e.preventDefault();
    tipIdx=(!hover&&tipIdx===i)?-1:i; renderTip();
  };
  window.gmTipHide=function(){ tipIdx=-1; renderTip(); };
  function renderSaveState(){
    const s=el('gmSave'); if(!s) return;
    s.textContent=serverOk===false?'기기에만 저장 중':(serverOk?'자동 저장됨':'');
  }
  function floatText(text,crit,big){
    const layer=el('gmFloat'); if(!layer) return;
    const d=document.createElement('span');
    d.className='gm-float'+(crit?' crit':'')+(big?' project':'');
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
  async function gmShowRanking(board){
    board=board==='stairs'?'stairs':'promo';
    const tabs=`<div class="gm-rank-tabs"><button type="button" class="${board==='promo'?'on':''}" onclick="gmShowRanking('promo')">🏆 승진</button><button type="button" class="${board==='stairs'?'on':''}" onclick="gmShowRanking('stairs')">🪜 무한의 계단</button></div>`;
    el('gmBody').innerHTML=tabs+'<div class="gm-intro">랭킹 불러오는 중…</div>';
    let html='';
    try{
      const j=await gas({action:'gameRanking',playerId:pid,board});
      if(!j.success) throw new Error(j.error);
      const info=x=>board==='stairs'?`${(x.stairs||0).toLocaleString()}층`:`${escHtml(charName(x.ch||0))} ${rankOf(x.level)[2]} · ${x.stage}단계`;
      const mine=board==='stairs'?`${(acc.stairsBest||0).toLocaleString()}층`:'나';
      html=`<div class="gm-rank-title">${board==='stairs'?'🪜 무한의 계단 최고 기록':'🏆 승진 랭킹'} <small>(${j.players}명)</small></div>`+
        (j.top.length?'':'<div class="gm-intro">아직 기록이 없습니다.</div>')+
        j.top.map((x,i)=>`<div class="gm-rank-row${x.me?' me':''}"><span>${i+1}</span><b>${escHtml(x.nickname)}</b><span>${info(x)}</span></div>`).join('')+
        (j.myRank>10?`<div class="gm-rank-row me"><span>${j.myRank}</span><b>${escHtml(nick)}</b><span>${mine}</span></div>`:'');
    }catch(e){
      const why=e&&e.name==='AbortError'?'서버 응답이 늦습니다':(e&&e.message&&e.message!=='no gas'?e.message:'네트워크 문제');
      html=`<div class="gm-intro">랭킹을 불러오지 못했습니다. (${escHtml(why)})</div><button type="button" class="gm-btn" onclick="gmShowRanking('${board}')">다시 시도</button>`;
    }
    if(!el('gmBody').querySelector('.gm-rank-tabs')) return; // 그 사이 다른 화면으로 이동
    el('gmBody').innerHTML=tabs+html+'<button type="button" class="gm-btn" onclick="gmBack()">돌아가기</button>';
  }

  /* ---------- 무한의 계단 ---------- */
  // 다음 계단이 왼쪽/오른쪽 어느 쪽인지 맞춰 누르며 오르기. 시간 막대는 오를수록 빨리 줄고, 맞게 누르면 조금 회복.
  // 틀리거나 시간이 다 되면 끝 → 층수 × 지금 단계 × 0.05 경험치 (단어 입력의 약 30% 효율)
  const STAIRS_REQ=12, STAIRS_EXP=0.05;
  let stairs=null, stairsFace=null;
  function stairsUnlocked(){ return acc.runs.some(r=>r&&r.lv>=STAIRS_REQ); }
  function stairsNew(){
    stairs={xs:[0],dirs:[],count:0,time:1,running:false,over:false,lastT:0,raf:0,result:''};
    stairsGrow();
  }
  function stairsGrow(){
    while(stairs.dirs.length<stairs.count+30){
      const prev=stairs.dirs[stairs.dirs.length-1]||(Math.random()<0.5?-1:1);
      const d=Math.random()<0.65?prev:-prev; // 같은 방향이 이어지는 경우가 더 많게
      stairs.dirs.push(d); stairs.xs.push(stairs.xs[stairs.xs.length-1]+d);
    }
  }
  function gmShowStairs(){
    if(!stairsUnlocked()){ toast(`🔒 주임(Lv.${STAIRS_REQ})을 달성한 직원이 있으면 열립니다`,2500); return; }
    const c=CHARS[acc.ch]||CHARS[0];
    // 계단 위에는 전신(바디) 이미지 — 없으면 얼굴, 그것도 없으면 이름
    stairsFace=null;
    const src=c.body||c.face;
    if(src){ stairsFace=new Image(); stairsFace.src=src; stairsFace.onload=()=>drawStairs(); }
    stairsNew();
    el('gmBody').innerHTML=`
      <div class="gm-st-head"><b>🪜 무한의 계단</b><span>최고 <b id="gmStBest">${(acc.stairsBest||0).toLocaleString()}</b>층</span></div>
      <canvas class="gm-st-cv" id="gmStCv" width="540" height="340"></canvas>
      <div class="gm-bar st"><i id="gmStTime" style="width:100%"></i></div>
      <div class="gm-st-info" id="gmStInfo">${isTouchDevice()?'◀ ▶ 버튼으로':'← → (또는 A / D) 키로'} 다음 계단 방향을 누르면 시작</div>
      <div class="gm-st-btns"><button type="button" onpointerdown="event.preventDefault();gmStep(-1)">◀</button><button type="button" onpointerdown="event.preventDefault();gmStep(1)">▶</button></div>
      <button type="button" class="gm-btn" onclick="gmStairsExit()">돌아가기</button>`;
    drawStairs();
    el('gmWidget').focus();
  }
  function gmStep(d){
    if(!stairs) return;
    lastInput=Date.now();
    if(stairs.over){ gmShowStairs(); return; } // 끝난 뒤 누르면 다시 시작
    if(!stairs.running){ stairs.running=true; stairs.lastT=performance.now(); stairs.raf=requestAnimationFrame(stairsLoop); el('gmStInfo').textContent='오르는 중…'; }
    if(d===stairs.dirs[stairs.count]){
      stairs.count++; stairs.time=Math.min(1,stairs.time+0.11);
      stairsGrow();
      el('gmStInfo').textContent=`${stairs.count.toLocaleString()}층`;
      drawStairs();
    } else stairsEnd('발을 헛디뎠습니다!');
  }
  function stairsLoop(t){
    if(!stairs||!stairs.running) return;
    const dt=Math.min(0.1,(t-stairs.lastT)/1000); stairs.lastT=t;
    stairs.time-=(0.28+Math.min(stairs.count,400)*0.0018)*dt; // 오를수록 빨리 줄어듦
    const bar=el('gmStTime'); if(bar) bar.style.width=Math.max(0,stairs.time*100)+'%';
    if(stairs.time<=0){ stairsEnd('시간 초과!'); return; }
    stairs.raf=requestAnimationFrame(stairsLoop);
  }
  function stairsEnd(why){
    if(!stairs||stairs.over) return;
    stairs.over=true; stairs.running=false; cancelAnimationFrame(stairs.raf);
    const n=stairs.count, exp=Math.round(n*Math.max(1,st.stage)*STAIRS_EXP);
    const best=n>(acc.stairsBest||0);
    if(best) acc.stairsBest=n;
    if(exp>0) gainExp(exp);
    dirty=true; saveServer(true);
    const info=el('gmStInfo');
    if(info) info.innerHTML=`${why} <b>${n.toLocaleString()}층</b> · 경험치 +${fmt(exp)}${best&&n?' · 🎉 최고 기록!':''}<br><small>아무 방향이나 누르면 다시 시작</small>`;
    if(el('gmStBest')) el('gmStBest').textContent=(acc.stairsBest||0).toLocaleString();
    drawStairs();
  }
  function drawStairs(){
    const cv=el('gmStCv'); if(!cv||!stairs) return;
    const g=cv.getContext('2d'), W=cv.width, H=cv.height, SW=104, SH=58, BW=92;
    g.clearRect(0,0,W,H);
    const cs=getComputedStyle(el('gmWidget'));
    const top=cs.getPropertyValue('--accent').trim()||'#e8732a', side=cs.getPropertyValue('--border').trim()||'#888';
    const cx=W/2, cy=H*0.68, px=stairs.xs[stairs.count];
    for(let i=Math.max(0,stairs.count-6);i<Math.min(stairs.xs.length,stairs.count+9);i++){
      const x=cx+(stairs.xs[i]-px)*SW, y=cy-(i-stairs.count)*SH;
      g.fillStyle=side; g.fillRect(x-BW/2,y,BW,20);
      g.fillStyle=i<stairs.count?side:top; g.globalAlpha=i<stairs.count?0.5:1; g.fillRect(x-BW/2,y-8,BW,10); g.globalAlpha=1;
    }
    // 캐릭터 — 계단 위에 선 전신 이미지. 마지막으로 오른 방향을 바라보도록 좌우 반전(왼쪽으로 오르면 뒤집음)
    g.save();
    if(stairs.over) g.globalAlpha=0.45;
    const img=stairsFace&&stairsFace.complete&&stairsFace.naturalWidth?stairsFace:null;
    if(img&&CHARS[acc.ch]&&CHARS[acc.ch].body){
      const h=96, w=Math.min(110,h*img.naturalWidth/img.naturalHeight), footY=cy-8;
      const face=stairs.count>0?stairs.dirs[stairs.count-1]:1;
      g.translate(cx,footY); if(face<0) g.scale(-1,1);
      g.drawImage(img,-w/2,-h,w,h);
    } else {
      const r=23, hx=cx, hy=cy-8-r;
      g.beginPath(); g.arc(hx,hy,r,0,Math.PI*2); g.closePath();
      if(img){ g.fillStyle='#f1ede8'; g.fill(); g.clip(); g.drawImage(img,hx-r,hy-r,r*2,r*2); }
      else { g.fillStyle=top; g.fill(); g.fillStyle='#fff'; g.font='bold 20px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(charName(acc.ch).slice(1),hx,hy); }
    }
    g.restore();
    // 다음 방향 힌트 없음(직접 보고 판단). 층수 표시
    g.fillStyle=cs.getPropertyValue('--text3').trim()||'#999'; g.font='bold 26px sans-serif'; g.textAlign='right'; g.textBaseline='bottom';
    g.fillText(stairs.count.toLocaleString()+'층',W-16,H-12);
  }
  window.gmShowStairs=gmShowStairs;
  window.gmStep=gmStep;
  window.gmStairsExit=function(){ if(stairs){ cancelAnimationFrame(stairs.raf); if(stairs.running) stairsEnd('그만 오름'); } stairs=null; renderPlay(); focusPlay(); };
  // 직원(캐릭터) 목록 — 해금 상태와 진행, 바꾸기
  function gmShowChars(){
    const hire=canHire();
    el('gmBody').innerHTML=`<div class="gm-rank-title">👥 직원 <small>${hire?'🎫 입사권 1장 — 원하는 직원을 고르세요':'사장 1명 달성마다 원하는 직원 1명 입사'}</small></div>`+
      CHARS.map((c,i)=>{
        const r=acc.runs[i], open=!!r||hire, cur=i===acc.ch;
        const diff=`업무량 ×${fmt(Math.pow(HP_STEP,r?r.tier:hiredCount()))}`;
        const info=r?`${rankOf(r.lv)[2]} Lv.${r.lv} · ${r.stage}단계${r.done?' · 🚀 사장 달성':''}`:hire?'🎫 눌러서 입사시키기':'🔒 사장을 달성하면 입사 가능';
        return `<button type="button" class="gm-char-row${cur?' cur':''}${open?'':' locked'}" ${open&&!cur?`onclick="gmSwitchChar(${i})"`:'disabled'}>
          <span class="gm-avatar">${faceHtml(i)}</span>
          <span class="gm-char-row-text"><b>${escHtml(c.name)}${cur?' (키우는 중)':''}</b><small>${info}</small></span>
          <span class="gm-char-row-diff">${diff}</span></button>`;
      }).join('')+'<button type="button" class="gm-btn" onclick="gmBack()">돌아가기</button>';
  }

  /* ---------- 열기/닫기 ---------- */
  async function gmOpen(){
    buildWidget();
    if(opened){ gmShow(); return; }
    opened=true;
    loadLocal();
    refreshWords();
    gmShow();
    if(!pid||!token){ renderNick(); (nick?el('gmPin'):el('gmNick'))?.focus(); return; }
    // 이 기기 저장으로 바로 시작 — 서버 확인은 뒤에서(느린 서버 때문에 기다리지 않게). 다른 기기 진행이 더 최신이면 바꿔서 이어감
    startPlay();
    if(await loadServer()&&mon){ combo=0; spawn(st.kills>=10); renderPlay(); focusPlay(); toast('다른 기기의 최신 진행을 불러왔습니다',2500); }
  }
  function startPlay(){
    applyOffline();
    spawn(st.kills>=10);
    renderPlay();
    focusPlay();
    startLoops();
  }
  function startLoops(){
    clearInterval(ticker); clearInterval(saver);
    lastTickAt=Date.now();
    ticker=setInterval(tick,100);
    saver=setInterval(()=>saveServer(false),SAVE_INTERVAL);
  }
  function stopLoops(){ clearInterval(ticker); clearInterval(saver); ticker=saver=null; }
  window.gmStart=async function(){
    const v=(el('gmNick').value||'').trim().slice(0,12), p=(el('gmPin').value||'').trim();
    if(!v){ el('gmNick').focus(); return; }
    if(!/^\d{4,6}$/.test(p)){ setLoginMsg('PIN은 숫자 4~6자리로 입력해주세요.',true); el('gmPin').focus(); return; }
    const btn=el('gmStartBtn'); btn.disabled=true; setLoginMsg('확인 중…');
    let j;
    try{ j=await gas({action:'gameLogin',nickname:v,pin:p}); }
    catch(e){ j={success:false,error:'서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'}; }
    if(!el('gmStartBtn')) return;
    btn.disabled=false;
    if(!j.success){ setLoginMsg(j.error||'로그인하지 못했습니다.',true); el('gmPin').value=''; el('gmPin').focus(); return; }
    setAccount({pid:j.playerId,token:j.token,nick:j.nickname});
    serverOk=true;
    const local=lsGet(LS_STATE,null);
    const localSt=local&&local.pid===pid&&local.state?local.state:null;
    // 이 기기 저장과 서버 저장 중 더 최근 것으로 이어하기
    const pick=[j.state,localSt].filter(Boolean).sort((a,b)=>(b.lastSave||0)-(a.lastSave||0))[0];
    useAcc(hydrate(pick));
    if(j.created) toast(`${j.nickname} 님, 입사를 환영합니다!`,3000);
    else toast(`${j.nickname} 님, 이어서 플레이합니다`,2500);
    dirty=true; saveServer(true); startPlay();
  };
  window.gmLogout=function(){
    saveServer(true);
    setAccount({pid:'',token:'',nick}); // 닉네임은 다음 로그인 칸에 채워 둠
    stopLoops(); mon=null; useAcc(acc0());
    renderNick(); el('gmPin')?.focus();
  };
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
  window.gmShowChars=gmShowChars;
  window.gmSwitchChar=switchChar;
  window.gmBack=function(){ if(stairs){ cancelAnimationFrame(stairs.raf); stairs=null; } renderPlay(); focusPlay(); };
  window.gmShow=function(){
    el('gmWidget').style.display=''; el('gmChip').style.display='none'; lastInput=Date.now();
    // 숨겨져 있던 동안의 커피 수혈(10%)을 반영하고 다시 진행
    if(mon&&!ticker){ applyOffline(); render(); startLoops(); }
    if(el('gmKeys')) focusPlay();
  };
  window.gmHide=function(){
    const w=el('gmWidget'); if(!w) return;
    if(w.contains(document.activeElement)) document.activeElement.blur();
    w.style.display='none'; el('gmChip').style.display=opened?'':'none'; combo=0;
    // 숨기면 진행을 멈추고, 다시 열 때 비활성 시간만큼 10% 효율로 계산
    if(mon){ stopLoops(); acc.inactiveAt=Date.now(); }
    saveServer(true);
  };
  window.gmClose=function(){
    if(mon) acc.inactiveAt=Date.now();
    saveServer(true);
    stopLoops(); opened=false; mon=null;
    el('gmWidget').remove(); el('gmChip').remove();
  };
  window.gmToggleLock=function(){
    locked=!locked; lsSet(LS_LOCK,locked); lastInput=Date.now();
    el('gmWidget').classList.toggle('locked',locked);
    toast(locked?'📌 고정 — 입력이 없어도 창을 숨기지 않습니다':'고정 해제 — 1분 동안 입력이 없으면 숨깁니다',2200);
  };
  window.gmToggleDim=function(){ const w=el('gmWidget'); w.classList.toggle('dim'); lsSet(LS_POS,w.classList.contains('dim')); };

  // 키보드 — 게임 창에 포커스가 있을 때만(대시보드 입력칸 타이핑과 섞이지 않게). Esc는 보스 키
  document.addEventListener('keydown',e=>{
    if(!opened||!isVisible()) return;
    if(e.key==='Escape'){ gmHide(); return; }
    if(!hasFocus()||e.target.tagName==='INPUT') return;
    if(e.ctrlKey||e.metaKey||e.altKey||e.repeat) return;
    lastInput=Date.now();
    // 무한의 계단 — ←/A/F 왼쪽, →/D/J 오른쪽
    if(stairs&&el('gmStCv')){
      if(['ArrowLeft','KeyA','KeyF'].includes(e.code)){ e.preventDefault(); gmStep(-1); }
      else if(['ArrowRight','KeyD','KeyJ'].includes(e.code)){ e.preventDefault(); gmStep(1); }
      return;
    }
    // 창은 잡혀 있는데 입력칸 밖이면 입력칸으로 (PC 단어 입력)
    if(el('gmType')){ el('gmType').focus(); return; }
    if(KEYS.some(k=>k[0]===e.code)||/^Key[A-Z]$/.test(e.code)){ e.preventDefault(); keyInput(e.code); }
  });
  // 다른 탭을 보러 가면 저장하고 진행을 멈춤 → 돌아오면 그동안은 커피 수혈 10%로 계산하고 이어서 진행.
  // 돌아온 순간 1분 무입력으로 바로 숨겨지지 않게 입력 시각도 새로 잡음
  document.addEventListener('visibilitychange',()=>{
    if(!opened) return;
    if(document.hidden){
      if(mon&&ticker){ stopLoops(); acc.inactiveAt=Date.now(); }
      saveServer(false);
    } else {
      lastInput=Date.now();
      if(mon&&!ticker&&isVisible()){ applyOffline(); render(); startLoops(); }
      if(locked&&isVisible()&&(document.activeElement===document.body||!document.activeElement)) focusPlay();
    }
  });

  // 이스터에그 — 푸터 AIRMAX를 2초 안에 3번
  let taps=[];
  document.addEventListener('click',e=>{
    if(!e.target.closest('.footer-brand')) return;
    const now=Date.now();
    taps=taps.filter(t=>now-t<2000).concat(now);
    if(taps.length>=3){ taps=[]; gmOpen(); }
  });
})();
