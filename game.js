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
   🍉 수박 게임: 대리를 달성한 직원이 있으면 열림. 같은 얼굴 공 두 개가 닿으면 다음 크기로 합체(오찬근 → … → 신동준).
   끝나면 점수만큼 경험치(단어 입력보다 낮은 효율), 최고 점수 랭킹 따로 집계.
   🧱 테트리스: 과장을 달성한 직원이 있으면 열림. 줄을 지운 점수만큼 경험치, 최고 점수 랭킹.
   🗺️ 미니게임 월드: 미니게임을 한곳에 모은 구름 지도. 잠긴 섬은 안개 + 🔒, 누르면 해금 직급 안내.
   ⚡ 깜짝 이벤트: 평일 하루 3번, 10~17시 중 무작위 정시에 시작해 1시간 진행(한국 시간). 날짜로 정해지므로 모두 같은 시간에 같은 이벤트.
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
  const LS_STATE='airmax_game_state3', LS_ACCT='airmax_game_acct', LS_POS='airmax_game_dim', LS_XY='airmax_game_xy', LS_LOCK='airmax_game_lock', LS_OPACITY='airmax_game_opacity';
  const SAVE_INTERVAL=30000, BOSS_TIME=30, IDLE_HIDE=60000;
  // 게임이 비활성(숨김/닫힘/페이지 닫힘)일 때 커피 수혈은 10% 효율로, 최대 누적 시간은 야근 강화로 10분부터 5분씩 늘어남
  const OFFLINE_RATE=0.1, OFFLINE_BASE_MIN=10, OFFLINE_STEP_MIN=5;
  // 업무 — [아이콘, 이름, 최소 직급, 최대 직급]. 직급(rankNo 1=인턴 … 11=사장)에 맞는 업무만 나옴.
  // 사장님 심부름류는 임원이 되어도 계속(사장님이 직접 시키니까), 신입 잡일은 저직급 전용, 결재·경영 업무는 고직급 전용
  const TASKS=[
    // 사무 업무
    ['📧','메일 폭탄',1,11],['📊','엑셀 정리',1,7],['📝','주간 보고서',1,7],['📞','고객 전화',1,7],['🗂️','서류 더미',1,9],
    ['📎','첨부 누락',1,6],['🖨️','프린터 고장',1,6],['📑','회의록',1,7],['💻','시스템 오류',1,8],['📋','점검표 취합',1,7],
    // 신입 잡일 — 대리~과장쯤에서 졸업
    ['🐠','어항 청소',1,4],['🪣','어항 물갈기',1,4],['☕','손님 커피 타기',1,4],['🪴','사무실 화분 물주기',1,4],
    ['🧻','화장실 휴지 채우기',1,3],['💧','정수기 물통 교체',1,4],['📦','택배 상하차',1,5],['🧹','퇴근 전 사무실 청소',1,4],
    ['🍽️','탕비실 설거지',1,3],['💡','형광등 교체',1,4],['🪑','행사 의자 나르기',1,5],['🔧','고장 난 의자 수리',1,4],
    ['❄️','에어컨 필터 청소',1,4],['🏦','은행 심부름',1,5],['🧾','법인카드 영수증 풀칠',1,5],['📠','팩스 보내기',1,5],
    ['📸','회사 블로그 사진',1,5],['🎁','명절 선물 포장',1,6],
    // 회사 생활
    ['🍻','회식 자리 예약',1,7],['🎤','회식 2차 노래방',1,8],['💐','경조사 대리 참석',1,9],['🚙','거래처 접대 운전',1,8],['📅','주말 출근',1,11],
    // 사장님 심부름 — 사장이 되면(11) 시킬 사람이 없어져서 빠짐
    ['🚗','사장님 차 세차',1,10],['🛍️','사장님 개인 심부름',1,10],['⛳','사장님 골프 예약',1,10],['🎒','사장님 자녀 숙제',1,10],
    ['🥬','사장님 댁 김장',1,10],['🏠','사장님 댁 이삿짐',1,10],['🅿️','사장님 차 대리 주차',1,10],['🐕','사장님 강아지 산책',1,10],
    ['📱','사장님 휴대폰 설정',1,10],
    // 중간 관리 — 대리~상무
    ['📈','월말 실적 집계',4,9],['🧑‍🏫','신입 교육',4,9],['🚨','클레임 수습',4,10],['🧯','안전 점검',4,8],['🗣️','팀 주간 회의',4,9],
    ['🗃️','결재 서류 검토',5,10],['🧮','예산안 작성',5,9],['📄','품의서 결재',5,10],['🤝','거래처 미팅',5,11],['🎖️','인사 평가',6,11],
    // 임원 업무 — 이사부터
    ['💰','연봉 협상',7,11],['📜','계약서 검토',7,11],['🏛️','이사회 자료 준비',8,11],['✍️','임원 결재',8,11],['📊','경영 실적 보고',8,11],
    ['🤵','주요 거래처 접대',8,11],['✈️','해외 출장',8,11],['🧑‍⚖️','노동청 실사 대응',8,11],
    // 지시 업무 — 직급이 오르면 자기가 하던 잡일을 아래로 내려보냄. 시킬 사람이 있어야 하니 과장(5)부터
    ['👉','신입에게 떠넘기기',5,11],['🐠','어항 청소 시키기',5,11],['☕','커피 심부름 시키기',5,11],['🧹','사무실 청소 시키기',5,11],
    ['📦','택배 상하차 시키기',6,11],['📝','보고서 대신 쓰게 하기',6,11],['📑','회의록 작성 지시',6,11],
    ['🅿️','주차 대신 시키기',7,11],['🎤','회식 2차 예약 시키기',7,11],['💐','경조사 대리 참석 시키기',9,11],
    // 사장 업무
    ['📢','신년사 작성',10,11],['💵','자금 결재',10,11],['🏅','시상식 참석',10,11],['🧓','회장님 의전',11,11]];
  // 보스(결재) — 결재 라인이 직급에 따라 올라감. 같은 직급 안에서는 단계마다 순환해서 이름이 널뛰지 않게
  const BOSSES=[['👔','팀장님 결재',1,3],['🧐','부장님 검토',3,5],['📈','분기 실적 보고',5,7],['🏢','본부장 회의',5,7],
    ['👨‍👩‍👧','사장님 가족 행사',7,9],['💼','사장님 보고',7,10],['🧓','회장님 방문',9,11],['🧑‍⚖️','감사 대응',9,11],
    ['🏛️','이사회 안건',10,11],['🤝','주주총회',11,11]];
  // 레벨 → 직급 (노가다 감성으로 승진 간격이 점점 길어짐). 마지막 '사장'을 달성하면 다음 캐릭터 해금
  const RANKS=[[1,'🧑‍🎓','인턴'],[5,'🧑‍💻','사원'],[12,'🧑‍💼','주임'],[22,'👨‍💼','대리'],[35,'🕴️','과장'],[50,'🎩','차장'],[70,'👑','부장'],[95,'🦸','이사'],[112,'💼','상무이사'],[130,'🎖️','전무이사'],[150,'🚀','사장']];
  const BOSS_LV=RANKS[RANKS.length-1][0];
  // 그림 리소스(assets/game/ui) — 스킬·업무·아이템 아이콘, 월드 지도, 계단 배경·발판
  const UI='assets/game/ui/';
  const SKILL_IMG={atkLv:'atk',autoLv:'auto',critLv:'crit',bonusLv:'bonus',offLv:'off',stairLv:'stair',suikaLv:'suika',tetrisLv:'tetris',extLv:'ext',mastLv:'mast',cafLv:'caf',focusLv:'focus',awakeLv:'awake',projLv:'proj',payLv:'pay',
    bossLv:'boss',preLv:'pre',vetLv:'vet',critPowLv:'critpow',orgLv:'org',signLv:'sign'};
  const TASK_IMG={'메일 폭탄':'mail','엑셀 정리':'excel','주간 보고서':'report','고객 전화':'phone','서류 더미':'papers','첨부 누락':'clip',
    '프린터 고장':'printer','회의록':'notebook','시스템 오류':'laptop','점검표 취합':'clipboard',
    '어항 청소':'fishbowl','어항 물갈기':'fishbowl','사장님 차 세차':'bucket','사장님 개인 심부름':'shopping','손님 커피 타기':'coffee2',
    '사무실 화분 물주기':'plant','화장실 휴지 채우기':'tissue','정수기 물통 교체':'waterjug','택배 상하차':'boxes','퇴근 전 사무실 청소':'broom',
    '탕비실 설거지':'dishes','사장님 골프 예약':'golf','사장님 자녀 숙제':'backpack','사장님 댁 김장':'cabbage','사장님 댁 이삿짐':'moving',
    '명절 선물 포장':'gift','경조사 대리 참석':'flowers','형광등 교체':'bulb','사장님 차 대리 주차':'carkey','은행 심부름':'bank',
    '회식 자리 예약':'beer','회식 2차 노래방':'mic','주말 출근':'calendar','행사 의자 나르기':'chairs','회사 블로그 사진':'camera',
    '사장님 강아지 산책':'collar','법인카드 영수증 풀칠':'receipts','고장 난 의자 수리':'chair','에어컨 필터 청소':'filter','팩스 보내기':'fax',
    '사장님 휴대폰 설정':'phone2','거래처 접대 운전':'sedan',
    // 중간 관리·임원 업무
    '월말 실적 집계':'tally','신입 교육':'teach','클레임 수습':'claim','안전 점검':'safety','팀 주간 회의':'teamtalk',
    '결재 서류 검토':'approve','예산안 작성':'budget','품의서 결재':'request','거래처 미팅':'handshake','인사 평가':'rating',
    '연봉 협상':'salary','계약서 검토':'contract','이사회 자료 준비':'boardprep','임원 결재':'execsign','경영 실적 보고':'bizreport',
    '주요 거래처 접대':'dinner','해외 출장':'trip','노동청 실사 대응':'labor',
    '신년사 작성':'speech','자금 결재':'funds','시상식 참석':'award','회장님 의전':'escort',
    '감사 대응':'inspect','이사회 안건':'boardroom','주주총회':'shareholders',
    // 지시 업무 — 시키는 그 잡일의 아이콘을 그대로 씀(본인이 하던 일을 넘기는 거라서)
    '신입에게 떠넘기기':'delegate','어항 청소 시키기':'fishbowl','커피 심부름 시키기':'coffee2','사무실 청소 시키기':'broom',
    '택배 상하차 시키기':'boxes','보고서 대신 쓰게 하기':'report','회의록 작성 지시':'notebook',
    '주차 대신 시키기':'carkey','회식 2차 예약 시키기':'mic','경조사 대리 참석 시키기':'flowers',
    '팀장님 결재':'binder','부장님 검토':'review','분기 실적 보고':'chart','본부장 회의':'meeting','사장님 가족 행사':'party','회장님 방문':'cane','사장님 보고':'briefcase'};
  const MONEY=`<img class="gm-money" src="${UI}skill-bonus.png" alt="실적"/>`;
  function rankNo(lv){ let n=1; RANKS.forEach((x,i)=>{ if(lv>=x[0]) n=i+1; }); return n; }
  function rankBadge(lv,cls){ return `<img class="${cls||'gm-badge'}" src="${UI}rank-${rankNo(lv)}.png" alt=""/>`; }
  function menuIcon(n){ return `<img class="gm-menu-ic" src="${UI}menu-${n}.png" alt=""/>`; }
  // 제목·탭·버튼에 쓰는 작은 그림 아이콘 (이모지 대신)
  function ic(f){ return `<img class="gm-ic" src="${UI}${f}" alt=""/>`; }
  const IC={promo:'menu-rank.png',stairs:'skill-stair.png',suika:'skill-suika.png',tetris:'skill-tetris.png',world:'menu-world.png',staff:'menu-staff.png'};
  const artCache={};
  function art(name){ if(!artCache[name]){ const im=new Image(); im.src=UI+name; artCache[name]=im; } return artCache[name]; }
  function artReady(im){ return im&&im.complete&&im.naturalWidth>0; }
  function drawCover(g,im,W,H){ const k=Math.max(W/im.naturalWidth,H/im.naturalHeight), w=im.naturalWidth*k, h=im.naturalHeight*k; g.drawImage(im,(W-w)/2,(H-h)/2,w,h); } // 사장 = 만렙(150)
  // 캐릭터 — 신동준 다음은 사장 달성할 때마다 원하는 직원을 골라 입사. 이미지가 없는 캐릭터는 이름으로 대신 표시(이미지는 생기는 대로 추가)
  // 사장까지 키운 직원은 회사에 남아, 지금 키우는 직원에게 가끔 '격려'를 보낸다 — 직원마다 효과가 다름.
  // kind: power 업무력 / auto 커피 수혈 / gold 실적 / exp 경험치 / boss 보스 처리량 / crit 몰입 확률(+%p) / combo 콤보 유지 / golden 황금 업무
  const CHARS=[
    {name:'신동준',face:'assets/game/dongjun-face.png',body:'assets/game/dongjun.png',
      cheer:{icon:'⌨️',name:'직접 뛰는 사장',kind:'power',v:3,sec:10,desc:'처리량 ×3'}},
    {name:'신원철',face:'assets/game/wonchul-face.png',body:'assets/game/wonchul.png?v=2',
      cheer:{icon:'☕',name:'커피 한 잔 하자',kind:'auto',v:5,sec:12,desc:'커피 수혈 ×5'}},
    {name:'강옥남',face:'assets/game/oknam-face.png',body:'assets/game/oknam.png?v=2',
      cheer:{icon:'💸',name:'이번 달 성과금',kind:'gold',v:3,sec:12,desc:'실적 ×3'}},
    {name:'이용훈',face:'assets/game/yonghun-face.png',body:'assets/game/yonghun.png',
      cheer:{icon:'🔥',name:'집중해서 가자',kind:'crit',v:0.5,sec:10,desc:'몰입 확률 +50%p'}},
    {name:'하문숙',face:'assets/game/munsuk-face.png',body:'assets/game/munsuk.png',
      cheer:{icon:'📋',name:'결재는 내가 본다',kind:'boss',v:2.5,sec:15,desc:'보스 처리량 ×2.5'}},
    {name:'신원옥',face:'assets/game/wonok-face.png',body:'assets/game/wonok.png?v=2',
      cheer:{icon:'📈',name:'배우면서 해라',kind:'exp',v:3,sec:15,desc:'경험치 ×3'}},
    {name:'천병석',face:'assets/game/byungsuk-face.png',body:'assets/game/byungsuk.png',
      cheer:{icon:'🔗',name:'흐름 끊지 마라',kind:'combo',v:1,sec:10,desc:'틀려도 콤보 유지'}},
    {name:'오찬근',face:'assets/game/changeun-face.png',body:'assets/game/changeun.png',
      cheer:{icon:'🌟',name:'오늘은 다 황금이다',kind:'golden',v:1,sec:8,desc:'모든 업무가 황금 업무'}},
  ];
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
  // req: 이 레벨(직급)이 되어야 열리는 스킬. 첫 레벨 비용은 해금 시점 분당 수입의 약 1~4분치(시뮬레이션 기준). 화면은 4칸 타일, 설명은 타일의 ?에 마우스를 올리면(휴대폰은 탭) 표시
  const UPGRADES=[
    {key:'atkLv',   icon:'⌨️', name:'업무력',      desc:lv=>`${usingWords()?'1글자에':'키 1번에'} ${fmt(power({...st,atkLv:lv})*(usingWords()?1.3:1))} 처리${lv%25===0?' (2배 보너스!)':''}`, base:10, grow:1.08, max:9999},
    {key:'autoLv',  icon:'☕', name:'커피 수혈',   desc:lv=>`가만히 있어도 초당 ${fmt(autoDps({...st,autoLv:lv}))} 처리`, base:30, grow:1.09, max:9999},
    {key:'critLv',  icon:'🔥', name:'몰입',        desc:lv=>lv?`${Math.round(critChance(lv)*100)}% 확률로 ${critMult().toFixed(1)}배 처리`:'아직 효과 없음 — 1레벨부터 1%씩', base:60, grow:1.11, max:100},
    {key:'bonusLv', icon:'💸', name:'성과금 수령', desc:lv=>`받는 실적 ×${goldMult(lv).toFixed(2)}`, base:150, grow:1.15, max:9999},
    {key:'offLv',   icon:'🌙', name:'야근',        desc:lv=>lv?`자리를 비워도 최대 ${fmtMin(offlineCapMin(lv))} 동안 커피 수혈(${Math.round(offRate(st.payLv)*100)}%)`:'아직 효과 없음 — 1레벨부터 10분', base:60, grow:1.3, max:47},
    {key:'stairLv', icon:'🦵', name:'계단 단련',   desc:lv=>`무한의 계단 경험치 +${lv*20}%`, base:3000, grow:1.45, max:25, req:12},
    {key:'suikaLv', icon:'🍉', name:'수박 장인',   desc:lv=>`수박 게임 경험치 +${lv*20}%`, base:250000, grow:1.45, max:25, req:22},
    {key:'tetrisLv',icon:'🧱', name:'테트리스 고수', desc:lv=>`테트리스 경험치 +${lv*20}%`, base:30000000, grow:1.45, max:25, req:35},
    {key:'extLv',   icon:'⏳', name:'결재 연장',   desc:lv=>`보스(결재) 제한 시간 ${BOSS_TIME+2*lv}초`, base:2000, grow:1.5, max:15, req:12},
    {key:'mastLv',  icon:'🧠', name:'숙련',        desc:lv=>`업무력 효과 +${lv*10}%`, base:300000, grow:1.25, max:9999, req:22},
    {key:'cafLv',   icon:'🫖', name:'카페인 중독', desc:lv=>`커피 수혈 효과 +${lv*10}%`, base:300000, grow:1.25, max:9999, req:22},
    {key:'focusLv', icon:'🔗', name:'집중력',      desc:lv=>`콤보 최대 ×${(2+0.1*lv).toFixed(1)}`, base:30000000, grow:1.3, max:20, req:35},
    {key:'awakeLv', icon:'⚡', name:'각성',        desc:lv=>`커피 수혈도 ${lv}% 확률로 3배 처리`, base:50000000, grow:1.6, max:10, req:35},
    {key:'projLv',  icon:'🏆', name:'프로젝트 달성', desc:lv=>`${(projChance(lv)*100).toFixed(1)}% 확률로 20배 처리 (크리티컬 상위)`, base:1500000000, grow:1.35, max:20, req:50},
    {key:'payLv',   icon:'🌃', name:'야근 수당',   desc:lv=>`자리 비운 동안 커피 수혈 효율 ${Math.round(offRate(lv)*100)}%`, base:1000000000, grow:1.35, max:20, req:50},
    // 임원 강화 — 과장부터 직급마다 하나씩 열림. 보스(결재)가 8배 단단해서 고직급에서 막히던 걸 푸는 게 목적
    {key:'bossLv',    icon:'🎯', name:'결재 집중', desc:lv=>`보스(결재)에게 주는 처리량 ×${(1+0.2*lv).toFixed(2)}`, base:40000000, grow:1.32, max:20, req:35},
    {key:'preLv',     icon:'📌', name:'선결재',    desc:lv=>`보스(결재)를 ${(2.5*lv).toFixed(1)}% 처리된 상태로 시작`, base:1200000000, grow:1.38, max:12, req:50},
    {key:'vetLv',     icon:'🏋️', name:'관록',      desc:lv=>`업무력 ×${(1+0.2*lv).toFixed(1)} (숙련과 곱해짐)`, base:20000000000, grow:1.35, max:15, req:70},
    {key:'critPowLv', icon:'💥', name:'과몰입',    desc:lv=>`몰입이 터질 때 ${(3+0.5*lv).toFixed(1)}배 처리`, base:80000000000, grow:1.38, max:14, req:95},
    {key:'orgLv',     icon:'🏢', name:'조직력',    desc:lv=>`커피 수혈 ×${(1+0.3*lv).toFixed(1)} (카페인 중독과 곱해짐)`, base:200000000000, grow:1.35, max:15, req:112},
    {key:'signLv',    icon:'👑', name:'전결권',    desc:lv=>`보스(결재) 중에는 콤보 한계 ×${(1+0.3*lv).toFixed(1)}`, base:400000000000, grow:1.4, max:15, req:130},
  ];
  // 저장 구조 — 계정(acc) 안에 캐릭터별 진행(runs). st는 지금 키우는 캐릭터의 진행
  const run0=()=>({lv:1,exp:0,gold:0,totalGold:0,atkLv:0,autoLv:0,critLv:0,bonusLv:0,offLv:0,stairLv:0,suikaLv:0,tetrisLv:0,extLv:0,mastLv:0,cafLv:0,focusLv:0,awakeLv:0,projLv:0,payLv:0,bossLv:0,preLv:0,vetLv:0,critPowLv:0,orgLv:0,signLv:0,stage:1,kills:0,bossFails:0,keys:0,bestCombo:0,done:false,tier:0});
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
  /* ---------- 깜짝 이벤트 ---------- */
  // 하루 3번, 10~17시 중 무작위 정시 시작 · 1시간. 날짜(한국 시간)를 씨앗으로 뽑아서 서버 없이도 모두 같은 일정.
  // 자리 비움(커피 10%) 계산에는 적용하지 않음
  const EVENTS=[
    {id:'party', icon:'🍻', img:'ev-party', name:'회식 타임',   desc:'경험치 ×2 · 실적 ×1.5', exp:2, gold:1.5},
    {id:'trip',  icon:'💼', img:'ev-trip', name:'사장님 출장', desc:'처리량 ×2',            power:2},
    {id:'coffee',icon:'☕', img:'ev-coffee', name:'커피 배달',   desc:'커피 수혈 ×4',          auto:4},
    {id:'golden',icon:'🌟', img:'ev-golden', name:'보너스 업무', desc:'황금 업무 실적 ×10', golden:0.2},
    {id:'bonus', icon:'📈', img:'ev-bonus', name:'성과급 시즌', desc:'실적 ×2',              gold:2},
  ];
  const EVENT_HOURS=[10,11,12,13,14,15,16,17], EVENTS_PER_DAY=3;
  let evOff=false, lastEventId='';
  function kst(){ const d=new Date(Date.now()+9*3600e3); return {key:d.toISOString().slice(0,10),h:d.getUTCHours(),m:d.getUTCMinutes(),s:d.getUTCSeconds(),wd:d.getUTCDay()}; }
  function seeded(str){ let h=1779033703^str.length; for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; }
    return ()=>{ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); h^=h>>>16; return (h>>>0)/4294967296; }; }
  function eventsOn(key){
    const rnd=seeded('testonic-event-'+key), pick=(arr,n)=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a.slice(0,n); };
    const hours=pick(EVENT_HOURS,EVENTS_PER_DAY).sort((a,b)=>a-b), types=pick(EVENTS,EVENTS_PER_DAY);
    return hours.map((h,i)=>({h,ev:types[i]}));
  }
  function currentEvent(){
    if(evOff) return null;
    const k=kst();
    if(k.wd===0||k.wd===6) return null; // 이벤트는 평일만
    const slot=eventsOn(k.key).find(x=>x.h===k.h);
    return slot?{...slot.ev,left:(59-k.m)*60+(60-k.s)}:null;
  }
  function evMult(kind){ const e=currentEvent(); return e&&e[kind]?e[kind]:1; }
  /* ---------- 사장까지 키운 선배의 격려 ---------- */
  // 사장을 달성한 다른 직원이 있으면, 업무를 끝낼 때 가끔 그 직원이 격려를 보낸다. 직원마다 효과가 다름.
  let cheer=null; // {ch, def, until}
  function cheerOn(){ if(cheer&&Date.now()>cheer.until) cheer=null; return cheer; }
  function cheerMult(kind){ const c=cheerOn(); return c&&c.def.kind===kind?c.def.v:1; }
  function cheerAdd(kind){ const c=cheerOn(); return c&&c.def.kind===kind?c.def.v:0; }
  function cheerHas(kind){ const c=cheerOn(); return !!(c&&c.def.kind===kind); }
  // 지금 키우는 직원 말고, 사장까지 키워 둔 선배들
  function seniors(){ return acc.runs.map((r,i)=>r&&r.done&&i!==acc.ch?i:-1).filter(i=>i>=0); }
  function tryCheer(){
    if(cheerOn()) return;
    const list=seniors(); if(!list.length) return;
    if(Math.random()>=Math.min(0.02*list.length,0.1)) return; // 선배 1명당 2%, 최대 10%
    const ch=list[Math.floor(Math.random()*list.length)], c=CHARS[ch];
    if(!c||!c.cheer) return;
    cheer={ch,def:c.cheer,until:Date.now()+c.cheer.sec*1000};
    toast(`${c.cheer.icon} ${c.name} 사장님의 격려 — ${c.cheer.desc} (${c.cheer.sec}초)`,3200);
    fxPop('fx-levelup',{x:3,cls:'lvup',gap:260,ms:1100});
    render();
  }
  function evChance(kind){ const e=currentEvent(); return e&&e[kind]||0; }

  function power(s){ return atkOf(s.atkLv,s.lv)*(1+0.1*(s.mastLv||0))*vetMult(s)*evMult('power')*cheerMult('power'); } // 업무력 × 숙련 × 관록 × 이벤트
  // 임원 강화 — 기존 강화를 한 번 더 곱해서 올림. 보스(결재)가 일반 업무보다 8배 단단해서 고직급에서 막히던 걸 푼다
  function vetMult(s){ return 1+0.2*((s||st).vetLv||0); }            // 관록 — 업무력 자체를 배수로
  function orgMult(s){ return 1+0.3*((s||st).orgLv||0); }            // 조직력 — 커피 수혈을 배수로
  function bossMult(){ return (1+0.2*(st.bossLv||0))*cheerMult('boss'); }                // 결재 집중 — 보스에게 주는 처리량만(만렙 ×5 — 선결재와 합쳐도 보스가 일반 업무보다 조금 단단하게 남도록)
  function preRate(){ return Math.min(0.025*(st.preLv||0),0.9); }    // 선결재 — 보스를 일부 처리된 상태로 시작
  function critMult(){ return 3+0.5*(st.critPowLv||0); }             // 과몰입 — 크리티컬 배수
  function signMult(){ return 1+0.3*(st.signLv||0); }                // 전결권 — 보스 중 콤보 한계
  // 커피 수혈 — +0.3: 강화 전에도 아주 천천히 자동 처리. 카페인 중독으로 증가.
  // 각성은 커피 전용 크리티컬(레벨당 1%, 최대 10%) — 방치만으로 너무 강해지지 않게 직접 플레이 몰입(최대 100%)과 따로 둠
  function autoDps(s){ return (s.autoLv+0.3)*power(s)*0.3*(1+0.1*(s.cafLv||0))*(1+2*0.01*(s.awakeLv||0))*orgMult(s)*evMult('auto')*cheerMult('auto'); }
  function critChance(critLv){ return Math.min(critLv*0.01,1); } // Lv.0은 효과 없음, 레벨당 +1% — Lv.100에서 100%
  function projChance(projLv){ return Math.min(0.005*projLv,0.1); }
  function offRate(payLv){ return OFFLINE_RATE+0.02*(payLv||0); }
  function bossTime(){ return BOSS_TIME+2*(st.extLv||0); }
  function goldMult(bonusLv){ return 1+bonusLv*0.15; }
  // 연속 성공마다 +5%(단어는 +10%), 최대 2배(집중력으로 증가). 보스 중에는 전결권만큼 한계가 더 올라감
  function comboMult(){ return Math.min(1+combo*(usingWords()?0.1:0.05),(2+0.1*(st.focusLv||0))*(mon&&mon.boss?signMult():1)); }
  function hpOf(stage,boss){ const b=15*Math.pow(1.2,stage-1)*Math.pow(HP_STEP,st.tier); return Math.ceil(boss?b*8:b); }
  function rewardOf(stage,boss){ const r=4*Math.pow(1.17,stage-1)*goldMult(st.bonusLv)*evMult('gold')*cheerMult('gold'); return Math.ceil(boss?r*8:r); }
  function expNeed(lv){ return Math.round(10*Math.pow(EXP_STEP,st.tier)*Math.pow(lv,1.6)); }
  function costOf(u,lv){ return Math.ceil(u.base*Math.pow(u.grow,lv)); }
  // Lv.0은 효과 없음(자리를 비우면 아무것도 처리되지 않음). 1레벨이 기존 기본값인 10분, 이후 레벨당 +5분
  function offlineCapMin(offLv){ return offLv>0?OFFLINE_BASE_MIN+OFFLINE_STEP_MIN*(offLv-1):0; }
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
  // 다른 기기에서 로그인하면 이 기기 토큰이 무효 → 저장하지 않고 로그아웃. 이 기기의 예전 진행도 지워서
  // 나중에 다시 로그인했을 때 옛날 데이터로 서버를 덮어쓰지 않게(백섭 방지)
  function authLost(msg){
    const keepNick=nick;
    setAccount(null); stopLoops(); mon=null; dirty=false; useAcc(acc0());
    try{ localStorage.removeItem(LS_STATE); }catch(e){}
    nick=keepNick;
    if(el('gmBody')){ if(!isVisible()) gmShow(); renderNick(); setLoginMsg(msg||'다른 기기에서 로그인되어 로그아웃되었습니다. 다시 로그인하면 최신 진행을 불러옵니다.',true); }
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
  // 직급에 맞는 것만 골라냄 — 전무이사가 '팀장님 결재'를 받거나 화장실 휴지를 채우는 일이 없게.
  // 밴드에 걸리는 게 없으면(밴드를 잘못 적었을 때) 전체로 돌아가서 업무가 아예 안 나오는 일은 막음
  function poolFor(list,rk){ const p=list.filter(x=>rk>=x[2]&&rk<=x[3]); return p.length?p:list; }
  function spawn(boss){
    const rk=rankNo(st.lv);
    const bp=poolFor(BOSSES,rk);
    const b=bp[(st.stage-1)%bp.length];
    const tp=poolFor(TASKS,rk);
    const t=boss?b:tp[Math.floor(Math.random()*tp.length)];
    const max=hpOf(st.stage,boss);
    const golden=!boss&&(cheerHas('golden')||Math.random()<evChance('golden'));
    // 선결재 — 보스는 일부가 이미 처리된 상태로 시작(막대는 그만큼 줄어 보임)
    mon={boss,emoji:t[0],name:t[1],hp:boss?Math.ceil(max*(1-preRate())):max,max,deadline:boss?Date.now()+bossTime()*1000:0,golden};
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
    if(mon.boss) dmg*=bossMult(); // 결재 집중 — 직접 입력이든 커피 수혈이든 보스에게는 더 세게
    mon.hp-=dmg;
    if(show) floatText((crit?'💥':'')+fmt(dmg),crit);
    if(mon.hp<=0) defeat();
    dirty=true;
  }
  function defeat(){
    const g=rewardOf(st.stage,mon.boss)*(mon.golden?10:1);
    if(mon.golden) floatText('🌟 황금 업무! 실적 ×10',true,true);
    st.gold+=g; st.totalGold+=g;
    fxPop('fx-coin',{cls:'coin',gap:250,ms:800});
    gainExp(mon.boss?st.stage*6:st.stage);
    if(mon.boss){ st.stage++; st.kills=0; st.bossFails=0; toast(`🎉 ${mon.name} 통과! ${st.stage}단계로`); }
    else st.kills++;
    tryCheer();
    spawn(st.kills>=10);
  }
  function gainExp(n,quiet){
    st.exp+=n*evMult('exp')*cheerMult('exp');
    if(st.lv>=BOSS_LV){ st.lv=BOSS_LV; st.exp=0; } // 만렙 — 경험치는 더 쌓지 않음
    while(st.lv<BOSS_LV&&st.exp>=expNeed(st.lv)){
      st.exp-=expNeed(st.lv); st.lv++;
      if(st.lv>=BOSS_LV) st.exp=0;
      const before=rankOf(st.lv-1), now=rankOf(st.lv);
      if(before[2]!==now[2]&&!quiet){ toast(`${now[2]}(으)로 승진했습니다!`); promoFx(st.lv); }
      else if(!quiet) fxPop('fx-levelup',{x:4,cls:'lvup',gap:400,ms:1000});
    }
    // 사장 달성 → 원하는 직원 한 명 입사권
    if(st.lv>=BOSS_LV&&!st.done){
      st.done=true;
      const c=CHARS[acc.ch]||CHARS[0];
      gmScene('scene-ceo.jpg',`<b>${escHtml(charName(acc.ch))} 사장 달성!</b><br>${canHire()?'직원 화면에서 원하는 직원을 한 명 입사시킬 수 있습니다.':'모든 직원을 사장으로 키웠습니다. 축하합니다!'}`,c.body);
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
    if(Math.random()<projChance(st.projLv||0)){ floatText('🏆 프로젝트 달성!',true,true); fxPop('fx-project',{cls:'big',ms:1200}); hit(base*20,true,true); return; }
    const crit=Math.random()<Math.min(critChance(st.critLv)+cheerAdd('crit'),1);
    if(crit) fxPop('fx-crit',{gap:120});
    hit(base*(crit?critMult():1),crit,true);
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
      wordPop(want);
      if(mon&&seqPos>=seq.length){ if(seq.length>1) floatText('✔ 완료',false); newSeq(); } else renderKeys();
    } else {
      if(!cheerHas('combo')) combo=0; // 천병석 사장님의 격려 중에는 틀려도 콤보가 안 풀림
      const k=el('gmKeys'); if(k){ k.classList.remove('miss'); void k.offsetWidth; k.classList.add('miss'); }
      renderKeys();
    }
  }
  // 맞힌 단어가 위로 착 날아가며 사라지는 효과
  function wordPop(word){
    const k=el('gmKeys'); if(!k) return;
    const r=k.getBoundingClientRect(), wr=el('gmWidget').getBoundingClientRect();
    const d=document.createElement('span'); d.className='gm-wordpop'; d.textContent=word;
    d.style.left=(r.left-wr.left+r.width/2)+'px'; d.style.top=(r.top-wr.top)+'px';
    el('gmWidget').appendChild(d); setTimeout(()=>d.remove(),500);
  }
  let enterPending=false;
  // 단어와 똑같아지면 Space/Enter 없이 바로 처리.
  // 한글 마지막 글자가 아직 조합 중일 수 있어 입력칸을 바로 비우지 않고(비우면 이어 친 다음 글자가 날아감)
  // 쓴 부분 길이(typedBase)만 기억 → 다음 단어는 그 뒤 글자로 비교하고, 조합이 끝나는 순간 앞부분을 잘라냄
  let typedBase=0;
  function checkTyped(submit,composing){
    const t=el('gmType'); if(!t) return;
    if(typedBase>t.value.length) typedBase=0;
    const v=t.value.slice(typedBase), clean=v.replace(/\s/g,'');
    if(!clean){ if(/\s/.test(v)){ t.value=''; typedBase=0; } return; }
    if(clean===seq[seqPos]){
      wordInput(clean);
      if(composing){ typedBase=t.value.length; scheduleIdleClear(); } else { t.value=''; typedBase=0; }
      return;
    }
    if(submit||/\s/.test(v)){ wordInput(clean); t.value=''; typedBase=0; }
  }
  function trimTyped(){ const t=el('gmType'); if(t&&typedBase>0){ t.value=t.value.slice(typedBase); typedBase=0; } }
  // 맞힌 뒤 손을 멈추면(0.35초) 조합을 끝내고 칸을 비움 — 이어 치는 중이 아니라 날아갈 글자가 없음
  let idleClearT=0;
  function scheduleIdleClear(){
    clearTimeout(idleClearT);
    idleClearT=setTimeout(()=>{
      const t=el('gmType'); if(!t||typedBase<=0) return;
      if(t.value.length>typedBase){ scheduleIdleClear(); return; } // 다음 단어를 치는 중 — 조합이 끝날 때 앞부분만 잘림
      typedBase=0; t.blur(); t.value='';
      setTimeout(()=>{ t.value=''; if(isVisible()&&!document.querySelector('.gm-scene')) t.focus(); },0);
    },350);
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
      if(!cheerHas('combo')) combo=0; // 천병석 사장님의 격려 중에는 틀려도 콤보가 안 풀림
      const k=el('gmKeys'); if(k){ k.classList.remove('miss'); void k.offsetWidth; k.classList.add('miss'); }
      renderKeys();
    }
    return true;
  }
  let lastTickAt=0;
  let beanAt=0;
  function tick(){
    if(!mon) return;
    const now=Date.now(), dt=Math.min((now-(lastTickAt||now))/1000,5); // 너무 오래 멈췄던 경우는 자리 비움 계산이 처리
    lastTickAt=now;
    hit(autoDps(st)*dt,false,false);
    if(now-beanAt>4000&&st.autoLv>0){ beanAt=now; fxPop('fx-coffee',{x:6+Math.random()*10,cls:'bean',ms:1600}); }
    if(mon&&mon.boss&&Date.now()>mon.deadline){
      st.bossFails++; st.kills=0;
      toast(`⏰ ${mon.name} 실패… 실력을 더 쌓고 다시 도전`);
      spawn(false);
    }
    // 1분 동안 입력이 없으면 저장하고 숨김 (📌 고정 중이면 숨기지 않음)
    if(!locked&&isVisible()&&Date.now()-lastInput>IDLE_HIDE) gmHide();
    if(Date.now()-lastRender>200) render();
    // 이벤트 시작/종료 알림
    const ev=currentEvent(), id=ev?ev.id+kst().key+ev.h:'';
    if(id!==lastEventId){ if(ev) toast(`⚡ 깜짝 이벤트! ${ev.icon} ${ev.name} — ${ev.desc}`,5000); else if(lastEventId) toast('이벤트가 끝났습니다',2500); lastEventId=id; }
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
    // 설명 말풍선 — 마우스가 ? 위에 있을 때만. 타일이 새로 그려져도(강화·비용 변경) 목록 단위로 판단하므로 남지 않음
    box.addEventListener('mouseover',e=>{
      const q=e.target.closest('.gm-tile-q, .gm-maxchip');
      if(q){ const i=+q.closest('[data-i]').dataset.i; if(tipIdx!==i||tipSticky){ tipIdx=i; tipSticky=false; renderTip(); } }
      else if(tipIdx>=0&&!tipSticky){ tipIdx=-1; renderTip(); }
    });
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
  document.addEventListener('pointerdown',e=>{ if(tipIdx>=0&&!e.target.closest('.gm-tile-q, .gm-maxchip')){ tipIdx=-1; tipSticky=false; renderTip(); } },true);
  window.addEventListener('pointercancel',holdStop);
  window.addEventListener('blur',holdStop);
  // 게임이 비활성이던 동안 — 커피 수혈이 10% 효율로 실제로 업무를 처리한 것처럼 계산 (최대 누적 시간은 야근 강화로 늘어남).
  // 지금 키우는 캐릭터에만 반영. 업무 건수·실적·경험치·단계까지 반영하고, 결재 보스는 커피만으로 30초 안에 처리될 때만 통과
  function applyOffline(){ evOff=true; try{ applyOfflineCalc(); } finally{ evOff=false; } }
  function applyOfflineCalc(){
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
      const boss=st.kills>=10, need=hpOf(st.stage,boss)*(1-(boss?preRate():0))/(dps*(boss?bossMult():1));
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
    gmScene('scene-away.jpg',`<b>자리 비운 ${awayText} 동안</b><br>커피 힘으로 업무 <b>${tasks.toLocaleString()}건</b> 처리 · 실적 +${fmt(gold)}${extra}`);
  }
  // 캐릭터 바꾸기 — 입사한 직원끼리는 언제든. 입사 안 한 직원은 입사권이 있을 때 골라서 입사(인턴부터, 입사 순서만큼 어려움)
  function switchChar(i){
    if(i<0||i>=CHARS.length) return;
    if(!acc.runs[i]){
      if(!canHire()) return;
      if(!confirm(`${charName(i)}을(를) 입사시킬까요?\n입사권은 사장 달성 1번에 1명입니다. (업무량 ×${fmt(Math.pow(HP_STEP,hiredCount()))})`)) return;
      acc.runs[i]=Object.assign(run0(),{tier:hiredCount()});
      gmScene('scene-hire.jpg',`<b>${escHtml(charName(i))} 입사!</b><br>인턴부터 다시 시작합니다. 잘 부탁드립니다!`,(CHARS[i]||{}).body);
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
        <span class="gm-title"><img class="gm-logo" src="assets/game/ui/logo.png" alt=""/>테스토닉 키우기</span>
        <span class="gm-head-btns">
          <button type="button" id="gmLockBtn" title="고정 — 입력이 없어도 창을 숨기지 않음" onclick="gmToggleLock()"><img class="gm-pin-ic" src="assets/game/ui/menu-pin.png" alt="고정"/></button>
          <button type="button" title="투명도" onclick="gmToggleDim()"><img class="gm-pin-ic" src="assets/game/ui/menu-opacity.png" alt="투명도"/></button>
          <button type="button" title="숨기기 (Esc)" onclick="gmHide()">−</button>
          <button type="button" title="닫기" onclick="gmClose()">×</button>
        </span>
      </div>
      <div class="gm-body" id="gmBody"></div>`;
    document.body.appendChild(w);
    const chip=document.createElement('button');
    chip.id='gmChip'; chip.className='gm-chip'; chip.type='button'; chip.title='테스토닉 키우기'; chip.innerHTML=`<img src="${UI}skill-auto.png" alt="열기"/>`;
    chip.onclick=()=>gmShow();
    document.body.appendChild(chip);
    // 투명도 — 슬라이더로 정한 값을 마우스를 올리거나 플레이 중에도 그대로 유지(예전 '반투명' 켜 둔 기기는 35%로 시작)
    const head0=w.querySelector('.gm-head');
    head0.insertAdjacentHTML('afterend',`<div class="gm-opbar" id="gmOpBar" style="display:none"><span>투명도</span><input type="range" id="gmOpRange" min="20" max="100" step="5"/><b id="gmOpVal"></b></div>`);
    let op=Number(lsGet(LS_OPACITY,0))||(lsGet(LS_POS,false)?35:100);
    const applyOp=v=>{ op=Math.min(100,Math.max(20,v)); w.style.opacity=op/100; el('gmOpRange').value=op; el('gmOpVal').textContent=op+'%'; };
    applyOp(op);
    el('gmOpRange').addEventListener('input',e=>{ applyOp(+e.target.value); lsSet(LS_OPACITY,op); lastInput=Date.now(); });
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
      <div class="gm-login-hero" style="background-image:url('${UI}login-bg.jpg')"><img src="${CHARS[0].body}" alt=""/></div>
      <div class="gm-intro"><span>테스토닉에 신입 <b>${CHARS[0].name}</b>이 입사했습니다.<br>
        화면에 뜨는 단어를 입력해(휴대폰은 탭) 업무를 처리하고, 사장까지 승진시켜 주세요. 사장이 되면 다음 직원이 입사합니다.</span></div>
      <input class="gm-input" id="gmNick" maxlength="12" placeholder="닉네임 (랭킹에 표시)" autocomplete="off" value="${escHtml(guess)}" onkeydown="if(event.key==='Enter')document.getElementById('gmPin').focus()"/>
      <input class="gm-input" id="gmPin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN 숫자 4~6자리" autocomplete="off" onkeydown="if(event.key==='Enter')gmStart()"/>
      <div class="gm-login-msg" id="gmLoginMsg">처음 쓰는 닉네임이면 새로 입사, 이미 있는 닉네임이면 PIN으로 이어하기</div>
      <button type="button" class="gm-btn primary" id="gmStartBtn" onclick="gmStart()">입사 / 이어하기</button>`;
  }
  function setLoginMsg(text,err){ const m=el('gmLoginMsg'); if(m){ m.textContent=text; m.classList.toggle('err',!!err); } }
  // 창 크기 고정 — 플레이 화면 높이를 기억해 두고 계단·랭킹·직원 화면도 같은 높이(넘치면 안에서 스크롤)
  let playH=0; const GM_MIN_H=550;
  function lockBodySize(){ const b=el('gmBody'); if(!b||!playH) return; b.style.height=playH+'px'; b.classList.add('fixed'); }
  function renderPlay(){
    tipIdx=-1; tipSticky=false;
    { const b=el('gmBody'); b.style.height=''; b.style.minHeight=''; b.classList.remove('fixed','padded'); }
    el('gmBody').innerHTML=`
      <div class="gm-event" id="gmEvent" style="display:none"></div>
      <div class="gm-char"><span class="gm-avatar">${faceHtml(acc.ch)}<i id="gmAvatar"></i></span>
        <div class="gm-char-info"><div id="gmRank"></div><div class="gm-bar"><i id="gmExpBar"></i></div></div></div>
      <div class="gm-stats"><span>${MONEY} <b id="gmGold"></b></span><span>${ic('task-binder.png')}<span id="gmStage"></span></span><span>${ic('skill-auto.png')}<span id="gmDps"></span></span></div>
      <div class="gm-cheer" id="gmCheer" style="display:none"></div>
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
      ${usingWords()
        ?'<div class="gm-keys words" id="gmKeys"></div><input class="gm-type" id="gmType" autocomplete="off" spellcheck="false" placeholder="위 단어를 입력하고 Space 또는 Enter"/>'
        :'<div class="gm-keys" id="gmKeys" onpointerdown="gmTouchTap(event)"></div><div class="gm-hint" id="gmFocusHint"></div>'}
      <div class="gm-ups" id="gmUps" onmouseleave="gmTipHide()"></div>
      <div class="gm-tip" id="gmTip" style="display:none"></div>
      <div class="gm-foot"><button type="button" class="gm-link" onclick="gmShowRanking()">${menuIcon('rank')}랭킹</button><button type="button" class="gm-link" onclick="gmShowChars()">${menuIcon('staff')}직원</button><button type="button" class="gm-link" onclick="gmShowWorld()">${menuIcon('world')}미니게임 월드</button><span id="gmSave"></span><button type="button" class="gm-link" onclick="gmLogout()">${menuIcon('logout')}로그아웃</button></div>`;
    render(); renderMonster(); renderKeys(); renderFocus();
    { const w=el('gmWidget'), b=el('gmBody'), short=GM_MIN_H-w.offsetHeight; // 창이 550px보다 짧으면 본문을 늘림
      if(short>0){ b.style.minHeight=(b.offsetHeight+short)+'px'; b.classList.add('padded'); } }
    playH=el('gmBody').offsetHeight;
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
      t.addEventListener('input',e=>{ lastInput=Date.now(); if(!e.isComposing) trimTyped(); if(typedBase>0) scheduleIdleClear(); checkTyped(false,e.isComposing); }); // 조합 중이어도 단어가 똑같아지면 바로 처리
      // 한글 조합이 끝난 뒤(Space/Enter로 마지막 글자 확정) — 값이 반영된 다음에 확인
      // 조합이 끝나는 순간(다음 글자를 치기 시작할 때) 이미 처리한 앞부분을 잘라냄 — 바로 이어 들어올 글자는 빈칸 뒤에 붙음
      t.addEventListener('compositionend',()=>{ trimTyped(); setTimeout(()=>{ const sub=enterPending; enterPending=false; checkTyped(sub); },0); });
    }
  }
  function focusPlay(){ const t=el('gmType'); (t||el('gmWidget')).focus(); }
  function renderKeys(){
    const k=el('gmKeys'); if(!k) return;
    k.innerHTML=seq.map((x,i)=>`<span class="gm-key${i<seqPos?' done':i===seqPos?' now':''}">${escHtml(typeof x==='string'?x:x[1])}</span>`).join('')+
      (combo>1?`<span class="gm-combo${combo>=20?' hot':''}"><img src="${UI}combo.png" alt=""/><b>${combo}</b> 콤보 ×${comboMult().toFixed(2)}</span>`:'');
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
    const ti=TASK_IMG[mon.name];
    if(ti) el('gmMonster').innerHTML=`<img src="${UI}task-${ti}.png" alt=""/>`; else el('gmMonster').textContent=mon.emoji;
    el('gmMonName').textContent=(mon.boss?'⚠ 보스 · ':mon.golden?'🌟 황금 · ':'')+mon.name;
    el('gmArena').classList.toggle('golden',!!mon.golden);
    el('gmArena').classList.toggle('boss',mon.boss);
  }
  function render(){
    lastRender=Date.now();
    if(!el('gmGold')) return;
    const r=rankOf(st.lv);
    { const av=el('gmAvatar'), n=String(rankNo(st.lv)); if(av.dataset.n!==n){ av.innerHTML=rankBadge(st.lv,'gm-av-badge'); av.dataset.n=n; } }
    // 직급·레벨 + 오른쪽에 경험치 수치(현재 / 다음 레벨까지, %)
    const need=expNeed(st.lv), pct=st.lv>=BOSS_LV?100:Math.min(99.9,st.exp/need*100);
    el('gmRank').innerHTML=`<span class="gm-rank-l"><b>${r[2]} ${escHtml(charName(acc.ch))}</b> · Lv.${st.lv}${st.lv>=BOSS_LV?' (MAX)':''} <span class="gm-nick">${escHtml(nick)}</span></span>`+
      `<span class="gm-exp-num">${st.lv>=BOSS_LV?'만렙':`${fmt(Math.floor(st.exp))} / ${fmt(need)} (${pct.toFixed(1)}%)`}</span>`;
    el('gmExpBar').style.width=(st.lv>=BOSS_LV?100:Math.min(100,st.exp/expNeed(st.lv)*100))+'%';
    el('gmGold').textContent=fmt(st.gold);
    el('gmStage').textContent=`${st.stage}단계 ${mon&&mon.boss?'보스':st.kills+'/10'}`;
    el('gmDps').textContent=`초당 ${fmt(autoDps(st))}`;
    // 선배 사장님의 격려가 걸려 있으면 남은 시간과 함께 보여줌
    const cb=el('gmCheer'), cz=cheerOn();
    if(cb){
      if(cz){ const left=Math.max(0,Math.ceil((cz.until-Date.now())/1000)), c=CHARS[cz.ch]||{};
        cb.style.display='';
        cb.innerHTML=`<img src="${escHtml(c.face||'')}" alt=""/><b>${escHtml(c.name||'')} 사장님의 격려</b><span>${cz.def.icon} ${escHtml(cz.def.desc)}</span><em>${left}초</em>`;
      } else cb.style.display='none';
    }
    const ev=currentEvent(), eb=el('gmEvent');
    if(eb){ if(ev){ eb.style.display='';
        if(eb.dataset.id!==ev.id){ eb.innerHTML=`<img class="gm-ev-ic" src="${UI}${ev.img}.png" alt=""/><span class="gm-ev-txt"><b>${ev.name}</b> · ${ev.desc}</span><span class="gm-ev-left" id="gmEvLeft"></span>`; eb.dataset.id=ev.id; }
        el('gmEvLeft').textContent=`${Math.ceil(ev.left/60)}분`; }
      else { eb.style.display='none'; eb.dataset.id=''; } }
    if(mon){
      el('gmHpBar').style.width=Math.max(0,mon.hp/mon.max*100)+'%';
      el('gmHpBar').parentElement.classList.toggle('boss',!!mon.boss);
      el('gmHpText').textContent=`남은 업무 ${fmt(Math.max(0,Math.ceil(mon.hp)))} / ${fmt(mon.max)}`;
      el('gmTimer').textContent=mon.boss?`⏱ ${Math.max(0,Math.ceil((mon.deadline-Date.now())/1000))}초`:'';
    }
    // 강화 타일 — 바뀐 게 있을 때만 다시 그림(누르는 도중에 버튼이 새로 그려져 클릭이 씹히지 않게)
    // 만렙 스킬은 큰 타일에서 빼서 맨 아래 작은 아이콘 줄(MAX)로 모음
    const maxedList=UPGRADES.map((u,i)=>[u,i]).filter(([u])=>(st[u.key]||0)>=u.max);
    const ups=UPGRADES.map((u,i)=>{
      const lv=st[u.key]||0, c=costOf(u,lv), maxed=lv>=u.max, locked=u.req&&st.lv<u.req;
      if(maxed) return '';
      const cls=locked?' locked':maxed?' maxed':st.gold<c?' off':'';
      return `<button type="button" class="gm-tile${cls}" data-i="${i}">
        <span class="gm-tile-q" onclick="gmTip(event,${i})">?</span>
        <span class="gm-tile-icon">${locked?`<img src="${UI}lock.png" alt=""/>`:SKILL_IMG[u.key]?`<img src="${UI}skill-${SKILL_IMG[u.key]}.png" alt=""/>`:u.icon}</span>
        <span class="gm-tile-name">${u.name}</span>
        <span class="gm-tile-lv">${locked?rankOf(u.req)[2]+' 달성':'Lv.'+lv}</span>
        <span class="gm-tile-cost">${locked?'':maxed?'MAX':MONEY+fmt(c)}</span></button>`;
    }).join('')+(maxedList.length?`<div class="gm-maxrow"><span class="gm-maxrow-label">MAX</span>${maxedList.map(([u,i])=>
      `<span class="gm-maxchip" data-i="${i}" title="${u.name} (MAX)">${SKILL_IMG[u.key]?`<img src="${UI}skill-${SKILL_IMG[u.key]}.png" alt=""/>`:u.icon}</span>`).join('')}</div>`:'');
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
    tip.innerHTML=`<b>${SKILL_IMG[u.key]?ic('skill-'+SKILL_IMG[u.key]+'.png'):u.icon} ${u.name}</b> <span>Lv.${lv}${maxed?' (MAX)':''}</span><br>`+
      (locked?`${ic('lock.png')}${rankOf(u.req)[2]}(Lv.${u.req}) 달성 시 열림<br>`:'')+
      `현재: ${u.desc(lv)}`+(maxed?'':`<br>다음: ${u.desc(lv+1)}`);
    tip.style.display='';
    const wr=w.getBoundingClientRect(), br=box.getBoundingClientRect();
    tip.style.top=Math.max(4,br.top-wr.top-tip.offsetHeight-6)+'px';
  }
  // ? 클릭/탭 — 고정해서 열기(다시 누르면 닫힘). 마우스 올림은 bindUpgradeHold에서 목록 단위로 처리
  let tipSticky=false;
  window.gmTip=function(e,i){
    e.stopPropagation(); e.preventDefault();
    if(tipIdx===i&&tipSticky){ tipIdx=-1; tipSticky=false; } else { tipIdx=i; tipSticky=true; }
    renderTip();
  };
  window.gmTipHide=function(){ if(tipSticky) return; tipIdx=-1; renderTip(); };
  function renderSaveState(){
    const s=el('gmSave'); if(!s) return;
    s.textContent=serverOk===false?'기기에만 저장 중':(serverOk?'자동 저장됨':'');
  }
  // 효과 그림 — 업무 칸 위에 잠깐 튀어나왔다 사라짐(자주 터지는 효과는 간격 제한)
  const fxLast={};
  function fxPop(name,opt){
    opt=opt||{}; const layer=el('gmFloat'); if(!layer||!isVisible()) return;
    const now=Date.now(); if(opt.gap&&now-(fxLast[name]||0)<opt.gap) return; fxLast[name]=now;
    const im=document.createElement('img');
    im.className='gm-fx '+(opt.cls||''); im.src=UI+name+'.png'; im.alt='';
    im.style.left=(opt.x!=null?opt.x:45+Math.random()*35)+'%'; if(opt.y!=null) im.style.top=opt.y+'%';
    layer.appendChild(im);
    setTimeout(()=>im.remove(),opt.ms||900);
  }
  // 승진 연출 — 꽃가루 + 새 직급 배지 + 문구 (창 위에 잠깐, 클릭은 통과)
  function promoFx(lv){
    const w=el('gmWidget'); if(!w||!isVisible()) return;
    const d=document.createElement('div'); d.className='gm-promo';
    d.innerHTML=`<img class="gm-promo-conf" src="${UI}fx-confetti.png" alt=""/>${rankBadge(lv,'gm-promo-badge')}<b>${rankOf(lv)[2]} 승진!</b>`;
    w.appendChild(d); setTimeout(()=>d.remove(),2600);
  }
  // 장면 카드 — 큰 순간(사장 달성·자리 비운 동안·새 직원 입사)을 그림과 함께. 누르면 닫힘(8초 뒤 자동)
  function gmScene(img,html,body){
    const w=el('gmWidget'); if(!w) return;
    w.querySelector('.gm-scene')?.remove();
    const d=document.createElement('div'); d.className='gm-scene';
    d.innerHTML=`<div class="gm-scene-card"><div class="gm-scene-art" style="background-image:url('${UI}${img}')">${body?`<img src="${body}" alt=""/>`:''}</div>
      <div class="gm-scene-txt">${html}</div><button type="button" class="gm-btn primary">확인</button></div>`;
    const close=()=>{ d.remove(); if(el('gmType')) focusPlay(); };
    d.addEventListener('click',close); setTimeout(close,8000);
    w.appendChild(d);
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
    t.className='gm-toast';
    const m=String(text).match(/^(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)\s*/u); // 맨 앞 이모지는 왼쪽 아이콘 자리로
    t.innerHTML=(m?`<span class="gm-toast-ic">${m[1]}</span>`:'')+`<span>${escHtml(m?text.slice(m[0].length):text)}</span>`;
    w.appendChild(t);
    setTimeout(()=>t.remove(),ms||2200);
  }
  async function gmShowRanking(board){
    board=['stairs','suika','tetris'].includes(board)?board:'promo';
    const tabs=`<div class="gm-rank-tabs"><button type="button" class="${board==='promo'?'on':''}" onclick="gmShowRanking('promo')">${ic(IC.promo)}승진</button><button type="button" class="${board==='stairs'?'on':''}" onclick="gmShowRanking('stairs')">${ic(IC.stairs)}계단</button><button type="button" class="${board==='suika'?'on':''}" onclick="gmShowRanking('suika')">${ic(IC.suika)}수박</button><button type="button" class="${board==='tetris'?'on':''}" onclick="gmShowRanking('tetris')">${ic(IC.tetris)}테트리스</button></div>`;
    el('gmBody').innerHTML=tabs+'<div class="gm-intro">랭킹 불러오는 중…</div>'; lockBodySize();
    let html='';
    try{
      const j=await gas({action:'gameRanking',playerId:pid,board});
      if(!j.success) throw new Error(j.error);
      const info=x=>board==='promo'?`${rankBadge(x.level,'gm-row-badge')}${escHtml(charName(x.ch||0))} ${rankOf(x.level)[2]} · ${x.stage}단계`:board==='stairs'?`${(x.stairs||0).toLocaleString()}층`:board==='suika'?`${(x.suika||0).toLocaleString()}점`:board==='tetris'?`${(x.tetris||0).toLocaleString()}점`:`${escHtml(charName(x.ch||0))} ${rankOf(x.level)[2]} · ${x.stage}단계`;
      const mine=board==='stairs'?`${(acc.stairsBest||0).toLocaleString()}층`:board==='suika'?`${(acc.suikaBest||0).toLocaleString()}점`:board==='tetris'?`${(acc.tetrisBest||0).toLocaleString()}점`:'나';
      html=`<div class="gm-rank-title">${ic(IC[board])}${board==='stairs'?'무한의 계단 최고 기록':board==='suika'?'수박 게임 최고 점수':board==='tetris'?'테트리스 최고 점수':'승진 랭킹'} <small>(${j.players}명)</small></div>`+
        (j.top.length?'':'<div class="gm-intro">아직 기록이 없습니다.</div>')+
        j.top.map((x,i)=>`<div class="gm-rank-row${x.me?' me':''}${i<3?' top top'+(i+1):''}"><span>${i<3?`<img class="gm-medal" src="${UI}medal-${i+1}.png" alt="${i+1}위"/>`:i+1}</span><b>${escHtml(x.nickname)}</b><span>${info(x)}</span></div>`).join('')+
        (j.myRank>10?`<div class="gm-rank-row me"><span>${j.myRank}</span><b>${escHtml(nick)}</b><span>${mine}</span></div>`:'');
    }catch(e){
      const why=e&&e.name==='AbortError'?'서버 응답이 늦습니다':(e&&e.message&&e.message!=='no gas'?e.message:'네트워크 문제');
      html=`<div class="gm-intro">랭킹을 불러오지 못했습니다. (${escHtml(why)})</div><button type="button" class="gm-btn" onclick="gmShowRanking('${board}')">다시 시도</button>`;
    }
    if(!el('gmBody').querySelector('.gm-rank-tabs')) return; // 그 사이 다른 화면으로 이동
    el('gmBody').innerHTML=tabs+html+'<button type="button" class="gm-btn" onclick="gmBack()">돌아가기</button>'; lockBodySize();
  }

  /* ---------- 무한의 계단 ---------- */
  // 다음 계단이 왼쪽/오른쪽 어느 쪽인지 맞춰 누르며 오르기. 시간 막대는 오를수록 빨리 줄고, 맞게 누르면 조금 회복.
  // 틀리거나 시간이 다 되면 끝 → 층수 × 지금 단계 × 0.05 경험치 (단어 입력의 약 30% 효율)
  // 아이템: 앞쪽 계단 몇 군데에 놓이고 밟으면 발동 — 🚀 로켓 +10층 / ⏰ 시계 시간 가득 / 🛡️ 방패 실수·시간 초과 1번 막음
  const STAIRS_REQ=12, STAIRS_BASE=100;
  // 미니게임 경험치 — '레벨 몇 개분'으로 계산(점수×단계로 곱하면 후반에 폭발해서).
  // 기준 점수에서 레벨 0.15개, 점수에 거의 비례(0.8제곱), 효율 스킬 +20%/레벨. 잘한 판은 10레벨 안팎까지.
  // 한 판 한도(cap, 레벨 개수)는 그 판에서 멀리 갈수록 열림 — 테트리스 단계·수박 최대 공·계단 층수
  function miniExp(score,base,skillLv,cap){
    if(score<=0||st.lv>=BOSS_LV) return 0;
    let L=Math.min(cap,0.15*Math.pow(score/base,0.8)*(1+0.2*(skillLv||0)));
    // 레벨 L개분을 실제 경험치로 — 레벨마다 필요한 양을 차례로 더함
    let exp=0, lv=st.lv, need=expNeed(lv)-st.exp;
    while(L>0&&lv<BOSS_LV){ const full=expNeed(lv), part=Math.min(L,need/full); exp+=part*full; L-=part; lv++; need=expNeed(lv); }
    return Math.round(exp);
  }
  let stairs=null, stairsFace=null;
  function stairsUnlocked(){ return acc.runs.some(r=>r&&r.lv>=STAIRS_REQ); }
  function stairsNew(){
    stairs={xs:[0],dirs:[],items:{},shield:0,count:0,time:1,running:false,over:false,lastT:0,raf:0,flash:null,fly:null,grace:false};
    stairsGrow();
  }
  function stairsGrow(){
    while(stairs.dirs.length<stairs.count+30){
      const prev=stairs.dirs[stairs.dirs.length-1]||(Math.random()<0.5?-1:1);
      const d=Math.random()<0.65?prev:-prev; // 같은 방향이 이어지는 경우가 더 많게
      stairs.dirs.push(d); stairs.xs.push(stairs.xs[stairs.xs.length-1]+d);
      const i=stairs.xs.length-1;
      // 아이템 — 5% 확률, 앞 6칸 안에 다른 아이템이 없을 때만 (로켓 40% · 시계 35% · 방패 25%)
      if(i>8&&Math.random()<0.05&&![1,2,3,4,5,6].some(k=>stairs.items[i-k])){
        const r=Math.random(); stairs.items[i]=r<0.4?'rocket':r<0.75?'clock':'shield';
      }
    }
  }
  const STAIR_ITEMS={rocket:'🚀',clock:'⏰',shield:'🛡️'};
  function stairsFlash(text){ stairs.flash={text,until:performance.now()+1200}; }
  function stairsItem(it){
    if(it==='rocket'){
      for(let k=1;k<=10;k++) delete stairs.items[stairs.count+k];
      stairs.fly={from:stairs.count,t0:performance.now(),dur:700};
      stairs.count+=10; stairs.time=1; stairsGrow(); stairsFlash('🚀 로켓! +10층');
    } else if(it==='clock'){ stairs.time=1; stairsFlash('⏰ 시간 충전!'); }
    else if(it==='shield'){ stairs.shield++; stairsFlash('🛡️ 방패 획득!'); }
  }
  function stairsInfo(){
    const i=el('gmStInfo'); if(!i) return;
    i.textContent=`${stairs.count.toLocaleString()}층`+(stairs.shield?` · 🛡️×${stairs.shield}`:'');
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
      <div class="gm-st-head"><b>${ic(IC.stairs)}무한의 계단</b><span>최고 <b id="gmStBest">${(acc.stairsBest||0).toLocaleString()}</b>층</span></div>
      <canvas class="gm-st-cv" id="gmStCv"></canvas>
      <div class="gm-bar st"><i id="gmStTime" style="width:100%"></i></div>
      <div class="gm-st-info" id="gmStInfo">${isTouchDevice()?'◀ ▶ 버튼으로':'← → (또는 A / D) 키로'} 다음 계단 방향을 누르면 시작</div>
      <div class="gm-st-btns"><button type="button" onpointerdown="event.preventDefault();gmStep(-1)">◀</button><button type="button" onpointerdown="event.preventDefault();gmStep(1)">▶</button></div>
      <button type="button" class="gm-btn" onclick="gmStairsExit()">${ic(IC.world)}월드로 돌아가기</button>`;
    lockBodySize();
    const cv=el('gmStCv'); cv.width=Math.round(cv.clientWidth*2)||540; cv.height=Math.round(cv.clientHeight*2)||340;
    drawStairs();
    el('gmWidget').focus();
  }
  function gmStep(d){
    if(!stairs) return;
    lastInput=Date.now();
    if(stairs.over){ gmShowStairs(); return; } // 끝난 뒤 누르면 다시 시작
    if(!stairs.running){ stairs.running=true; stairs.lastT=performance.now(); stairs.raf=requestAnimationFrame(stairsLoop); el('gmStInfo').textContent='오르는 중…'; }
    if(stairs.fly) return; // 로켓 비행 중 입력은 무시(실패로 치지 않음)
    if(d===stairs.dirs[stairs.count]){
      stairs.grace=false;
      stairs.count++; stairs.time=Math.min(1,stairs.time+0.11);
      stairsGrow();
      const it=stairs.items[stairs.count]; if(it){ delete stairs.items[stairs.count]; stairsItem(it); }
      stairsInfo(); drawStairs();
    } else if(stairs.grace){ stairsFlash('🚀 착지! 다음 방향을 확인하세요'); drawStairs(); } // 착지 직후 첫 걸음은 보호
    else if(stairs.shield>0){ stairs.shield--; stairsFlash('🛡️ 방패가 막아줬습니다!'); stairsInfo(); drawStairs(); }
    else stairsEnd('발을 헛디뎠습니다!');
  }
  function stairsLoop(t){
    if(!stairs||!stairs.running) return;
    const now=performance.now(), dt=Math.max(0,Math.min(0.1,(now-stairs.lastT)/1000)); stairs.lastT=now;
    if(stairs.fly){ // 로켓 비행 중 — 시간은 그대로, 끝나면 착지 보호
      if(now-stairs.fly.t0>=stairs.fly.dur){ stairs.fly=null; stairs.grace=true; }
      drawStairs(); stairs.raf=requestAnimationFrame(stairsLoop); return;
    }
    stairs.time-=(0.28+Math.min(stairs.count,400)*0.0018)*dt; // 오를수록 빨리 줄어듦
    const bar=el('gmStTime'); if(bar) bar.style.width=Math.max(0,stairs.time*100)+'%';
    if(stairs.flash) drawStairs(); // 아이템 문구가 사라질 때까지 다시 그림
    if(stairs.time<=0){
      if(stairs.shield>0){ stairs.shield--; stairs.time=0.5; stairsFlash('🛡️ 방패가 시간 초과를 막았습니다!'); stairsInfo(); } // 방패는 시간 초과도 1번 막음
      else { stairsEnd('시간 초과!'); return; }
    }
    stairs.raf=requestAnimationFrame(stairsLoop);
  }
  function stairsEnd(why){
    if(!stairs||stairs.over) return;
    stairs.over=true; stairs.running=false; cancelAnimationFrame(stairs.raf);
    const n=stairs.count, exp=miniExp(n,STAIRS_BASE,st.stairLv,1+Math.floor(n/50)); // 계단 단련으로 증가, 50층마다 한도 +1레벨
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
    // 배경 — 세로로 긴 그림을 폭에 맞춰, 300층까지 오를수록 위쪽(하늘 → 우주)이 보이게
    const bg=art('stairs-bg.jpg');
    if(artReady(bg)){ const bh=bg.naturalHeight*W/bg.naturalWidth, prog=Math.min(1,stairs.count/300), sy=(bh-H)*(1-prog);
      g.drawImage(bg,0,-sy,W,bh);
      // 발판이 배경(하늘·우주)에 묻히지 않도록 가운데를 살짝 어둡게 깔아줌
      const sc=g.createLinearGradient(0,0,W,0);
      sc.addColorStop(0,'rgba(0,0,0,0)'); sc.addColorStop(0.5,'rgba(0,0,0,0.42)'); sc.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=sc; g.fillRect(0,0,W,H); }
    const step=art('step.png'), stepOk=artReady(step);
    // 카메라 위치 f — 평소엔 지금 층, 로켓 비행 중엔 출발 층→도착 층으로 부드럽게
    let f=stairs.count, flyK=0;
    if(stairs.fly){ flyK=Math.min(1,(performance.now()-stairs.fly.t0)/stairs.fly.dur); const e=1-Math.pow(1-flyK,3); f=stairs.fly.from+(stairs.count-stairs.fly.from)*e; }
    const fi=Math.floor(f), px=stairs.xs[fi]+(stairs.xs[Math.min(fi+1,stairs.xs.length-1)]-stairs.xs[fi])*(f-fi);
    const cx=W/2, cy=H*0.68;
    for(let i=Math.max(0,fi-6);i<Math.min(stairs.xs.length,fi+18);i++){
      const x=cx+(stairs.xs[i]-px)*SW, y=cy-(i-f)*SH;
      if(y<-40) break;
      const next=i===stairs.count+1;              // 바로 다음에 밟을 발판
      if(stairs.grace&&next){ g.save(); g.shadowColor='#ffcf4a'; g.shadowBlur=24; g.fillStyle='#ffcf4a'; g.fillRect(x-BW/2-4,y-12,BW+8,18); g.restore(); }
      // 다음 발판 — 밟을 자리가 한눈에 보이게 밝은 받침을 깔고 테두리를 두름
      if(next&&!stairs.over){
        const pulse=0.5+0.5*Math.sin(performance.now()/300);
        g.save();
        g.fillStyle='rgba(0,0,0,0.5)'; g.fillRect(x-BW/2-9,y-15,BW+18,28);
        g.globalAlpha=0.55+0.45*pulse; g.strokeStyle='#ffe07a'; g.lineWidth=3;
        g.strokeRect(x-BW/2-9,y-15,BW+18,28);
        g.restore();
      }
      g.save();
      // 배경(도시·하늘·우주)이 복잡해도 발판이 떠 보이게 — 어두운 테두리를 두른 뒤 그림자까지
      const dim=i<stairs.count?0.45:1;
      if(stepOk){
        const sw=BW*1.12, sh=sw*step.naturalHeight/step.naturalWidth;
        g.globalAlpha=dim;
        g.shadowColor='rgba(0,0,0,0.85)'; g.shadowBlur=6; g.shadowOffsetX=0; g.shadowOffsetY=0;
        for(let k=0;k<3;k++) g.drawImage(step,x-sw/2,y-10,sw,sh); // 같은 자리에 겹쳐 그려 테두리를 진하게
        g.shadowBlur=12; g.shadowOffsetY=5;
        g.drawImage(step,x-sw/2,y-10,sw,sh);
        g.globalAlpha=1;
      } else {
        g.shadowColor='rgba(0,0,0,0.7)'; g.shadowBlur=10; g.shadowOffsetY=4;
        g.globalAlpha=dim;
        g.fillStyle=side; g.fillRect(x-BW/2,y,BW,20);
        g.fillStyle=i<stairs.count?side:top; g.fillRect(x-BW/2,y-8,BW,10);
        g.globalAlpha=1;
      }
      g.restore();
      if(stairs.items[i]&&i>stairs.count){ const it=art('item-'+stairs.items[i]+'.png');
        if(artReady(it)){ const ih=46, iw=ih*it.naturalWidth/it.naturalHeight; g.drawImage(it,x-iw/2,y-10-ih,iw,ih); }
        else { g.font='34px sans-serif'; g.textAlign='center'; g.textBaseline='bottom'; g.fillText(STAIR_ITEMS[stairs.items[i]],x,y-10); } }
    }
    // 캐릭터 — 계단 위에 선 전신 이미지. 마지막으로 오른 방향을 바라보도록 좌우 반전(왼쪽으로 오르면 뒤집음)
    g.save();
    if(stairs.over) g.globalAlpha=0.45;
    const img=stairsFace&&stairsFace.complete&&stairsFace.naturalWidth?stairsFace:null;
    if(img&&CHARS[acc.ch]&&CHARS[acc.ch].body){
      const h=96, w=Math.min(110,h*img.naturalWidth/img.naturalHeight), footY=cy-8;
      const face=stairs.count>0?stairs.dirs[stairs.count-1]:1;
      g.translate(cx,footY-(stairs.fly?Math.sin(flyK*Math.PI)*30:0)); // 비행 중엔 살짝 떠오름
      if(stairs.fly){ const rk=art('item-rocket.png'); if(artReady(rk)){ const rh=58, rw=rh*rk.naturalWidth/rk.naturalHeight; g.drawImage(rk,-rw/2,-8,rw,rh); } else { g.font='40px sans-serif'; g.textAlign='center'; g.textBaseline='top'; g.fillText('🚀',0,-6); } }
      if(stairs.shield>0&&!stairs.over){ const sd=art('item-shield.png'); // 방패 보유 표시
        if(artReady(sd)){ const sh2=36, sw2=sh2*sd.naturalWidth/sd.naturalHeight; g.drawImage(sd,w/2+2,-h*0.55-sh2/2,sw2,sh2);
          if(stairs.shield>1){ g.font='bold 22px sans-serif'; g.textAlign='left'; g.textBaseline='middle'; g.lineWidth=4; g.strokeStyle='rgba(0,0,0,0.6)'; g.strokeText('×'+stairs.shield,w/2+sw2+4,-h*0.55); g.fillStyle='#fff'; g.fillText('×'+stairs.shield,w/2+sw2+4,-h*0.55); } }
        else { g.font='30px sans-serif'; g.textAlign='left'; g.textBaseline='middle'; g.fillText('🛡️'+(stairs.shield>1?'×'+stairs.shield:''),w/2+2,-h*0.55); } }
      if(face<0) g.scale(-1,1);
      g.drawImage(img,-w/2,-h,w,h);
    } else {
      const r=23, hx=cx, hy=cy-8-r;
      g.beginPath(); g.arc(hx,hy,r,0,Math.PI*2); g.closePath();
      if(img){ g.fillStyle='#f1ede8'; g.fill(); g.clip(); g.drawImage(img,hx-r,hy-r,r*2,r*2); }
      else { g.fillStyle=top; g.fill(); g.fillStyle='#fff'; g.font='bold 20px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(charName(acc.ch).slice(1),hx,hy); }
    }
    g.restore();
    // 아이템 발동 문구
    if(stairs.flash){
      if(performance.now()>stairs.flash.until) stairs.flash=null;
      else { g.font='bold 30px sans-serif'; g.textAlign='center'; g.textBaseline='top'; g.lineWidth=6; g.strokeStyle='rgba(0,0,0,0.55)'; g.strokeText(stairs.flash.text,W/2,16); g.fillStyle='#ffcf4a'; g.fillText(stairs.flash.text,W/2,16); }
    }
    // 다음 방향 힌트 없음(직접 보고 판단). 층수 표시
    g.font='bold 28px sans-serif'; g.textAlign='right'; g.textBaseline='bottom'; g.lineWidth=6; g.strokeStyle='rgba(0,0,0,0.55)';
    g.strokeText(stairs.count.toLocaleString()+'층',W-16,H-12); g.fillStyle='#fff'; g.fillText(stairs.count.toLocaleString()+'층',W-16,H-12);
  }
  window.gmShowStairs=gmShowStairs;
  if(window.__GM_TEST){ window.__gmStairs=()=>stairs; window.__gmSuika=()=>suika; } // 자동 테스트에서만 내부 상태 확인용

  /* ---------- 수박 게임 ---------- */
  // 같은 얼굴 공 두 개가 닿으면 다음 크기로 합체. 크기 순서(작은 → 큰): 오찬근 이용훈 천병석 하문숙 신원옥 강옥남 신원철 신동준.
  // 신동준 둘이 합쳐지면 사라지며 보너스. 공이 위쪽 선을 넘은 채 잠시 머물면 끝 → 점수 × 지금 단계 × 0.05 경험치
  const SUIKA_REQ=22, SUIKA_BASE=500;
  const SK_NAMES=['오찬근','이용훈','천병석','하문숙','신원옥','강옥남','신원철','신동준'];
  const SK_R=[0.042,0.056,0.072,0.09,0.11,0.135,0.164,0.198]; // 판 폭 대비 반지름
  const SK_COLORS=['#9ad1ff','#7fd99a','#ffd166','#ff9f6e','#f78fb3','#b392f0','#5ec2c2','#ff6b6b'];
  let suika=null;
  function suikaUnlocked(){ return acc.runs.some(r=>r&&r.lv>=SUIKA_REQ); }
  function skImgs(){
    return SK_NAMES.map(n=>{ const c=CHARS.find(x=>x.name===n); if(!c||!c.face) return null; const im=new Image(); im.src=c.face; return im; });
  }
  function skNextTier(){ const r=Math.random(); return r<0.35?0:r<0.65?1:r<0.87?2:3; } // 떨어뜨리는 공은 작은 4종
  function gmShowSuika(){
    if(!suikaUnlocked()){ toast(`🔒 대리(Lv.${SUIKA_REQ})를 달성한 직원이 있으면 열립니다`,2500); return; }
    if(suika) cancelAnimationFrame(suika.raf);
    if(stairs){ cancelAnimationFrame(stairs.raf); stairs=null; }
    el('gmBody').innerHTML=`
      <div class="gm-st-head"><b>${ic(IC.suika)}수박 게임</b><span>점수 <b id="gmSkScore">0</b> · 최고 <b id="gmSkBest">${(acc.suikaBest||0).toLocaleString()}</b></span></div>
      <canvas class="gm-st-cv gm-sk-cv" id="gmSkCv"></canvas>
      <div class="gm-st-info" id="gmSkInfo">${isTouchDevice()?'떨어뜨릴 곳을 탭하세요':'← → 로 옮기고 Space(또는 ↓)로 떨어뜨리기 · 마우스로도 가능'}</div>
      <button type="button" class="gm-btn" onclick="gmSuikaExit()">${ic(IC.world)}그만하고 월드로</button>`;
    lockBodySize();
    const cv=el('gmSkCv'); cv.width=Math.round(cv.clientWidth*2)||700; cv.height=Math.round(cv.clientHeight*2)||700;
    suika={W:cv.width,H:cv.height,L:Math.round(cv.width*0.075),R:Math.round(cv.width*0.925),F:Math.round(cv.height*0.93),T:Math.round(cv.height*0.17),balls:[],score:0,over:false,dropX:cv.width/2,cur:skNextTier(),next:skNextTier(),cool:0,danger:0,flash:null,
      imgs:skImgs(),keys:{},lastT:performance.now(),raf:0,id:0};
    cv.addEventListener('pointermove',e=>{ const r=cv.getBoundingClientRect(); suika&&(suika.dropX=(e.clientX-r.left)/r.width*suika.W); });
    cv.addEventListener('pointerdown',e=>{ e.preventDefault(); lastInput=Date.now(); if(!suika) return; if(suika.over){ gmShowSuika(); return; }
      const r=cv.getBoundingClientRect(); suika.dropX=(e.clientX-r.left)/r.width*suika.W; skDrop(); });
    suika.raf=requestAnimationFrame(skLoop);
    el('gmWidget').focus();
  }
  function skR(t){ return SK_R[t]*suika.W; }
  // 넘침 판정 — 선을 완전히 벗어나(공 아래쪽까지 선 위로 올라가) 멈춘 공이 있는지.
  // 떨어지는 중이거나 튕기는 중인 공은 제외(새로 놓은 공은 항상 선 위에서 출발하므로).
  function skOverflow(){
    if(!suika) return false;
    const line=suika.T, rest=suika.H*0.06;
    return suika.balls.some(b=>b.age>0.8&&Math.abs(b.vy)<rest&&b.y+b.r<line);
  }
  function skDrop(){
    if(!suika||suika.over||suika.cool>0) return;
    // 선을 완전히 넘은 공이 아직 남아 있으면 다음 공을 놓는 순간 끝 — 합쳐서 치울 시간을 한 번 더 준 셈
    if(skOverflow()){ skEnd('공이 넘쳤습니다!'); return; }
    const r=skR(suika.cur), x=Math.min(suika.R-r,Math.max(suika.L+r,suika.dropX));
    suika.balls.push({id:++suika.id,x,y:r+6,vx:0,vy:0,r,t:suika.cur,age:0});
    suika.cur=suika.next; suika.next=skNextTier(); suika.cool=0.45;
  }
  function skLoop(){
    const now=performance.now();
    if(!suika||!el('gmSkCv')){ suika=null; return; }
    const dt=Math.max(0,Math.min(0.033,(now-suika.lastT)/1000)); suika.lastT=now; // 첫 프레임 시각이 시작 시각보다 앞설 수 있어 음수 방지
    if(!suika.over){
      suika.cool=Math.max(0,suika.cool-dt);
      const mv=(suika.keys.L?-1:0)+(suika.keys.R?1:0); if(mv) suika.dropX=Math.min(suika.W,Math.max(0,suika.dropX+mv*suika.W*0.9*dt));
      for(let k=0;k<4;k++) skStep(dt/4);
      // 선을 완전히 넘은 공이 있으면 경고만 — 실제로 끝나는 건 다음 공을 놓는 순간(skDrop)
      suika.danger=skOverflow()?suika.danger+dt:0;
    }
    skDraw();
    suika.raf=requestAnimationFrame(skLoop);
  }
  function skStep(dt){
    const S=suika, G=S.H*3.2, B=S.balls;
    // 무게 = 부피(반지름³) — 큰 공일수록 훨씬 무거워서, 큰 공이 작은 공을 치면 작은 공이 툭 밀려나고 쌓이면 아래를 눌러 비집고 들어감.
    // 회전: 각속도 w, 각도 a. 바닥·벽·다른 공과 닿은 면의 미끄러짐을 마찰로 줄이면서 구르게 함 (관성모멘트 = 질량·r²/2)
    const SK_E=0.35; // 공끼리 튕김(부딪히면 툭) — 바닥은 안 튕기고 그대로 내려앉음
    for(const b of B){ b.touch=false; b.age+=dt; b.vy+=G*dt; b.vx*=0.999; b.w=(b.w||0)*0.998; b.x+=b.vx*dt; b.y+=b.vy*dt; b.a=(b.a||0)+b.w*dt;
      // 벽·바닥은 배경 그림의 나무 상자 안쪽(L·R·F)
      if(b.x<S.L+b.r){ b.x=S.L+b.r; b.vx=Math.abs(b.vx)*0.45; b.w*=0.8; } if(b.x>S.R-b.r){ b.x=S.R-b.r; b.vx=-Math.abs(b.vx)*0.45; b.w*=0.8; }
      if(b.y>S.F-b.r){ b.y=S.F-b.r; b.touch=true; b.vy=0; // 바닥에 닿으면 튕기지 않음
        const slip=b.vx-b.w*b.r, jt=-slip/3*0.6; // 바닥 마찰 — 미끄러짐을 줄이고 그만큼 회전
        b.vx+=jt; b.w-=2*jt/b.r; b.vx*=0.985; } }
    for(let it=0;it<3;it++){
      for(let i=0;i<B.length;i++){ const a=B[i]; if(a.dead) continue;
        for(let j=i+1;j<B.length;j++){ const b=B[j]; if(b.dead) continue;
          const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy), m=a.r+b.r;
          if(a.t===b.t&&d<m+S.W*0.004){ skMerge(a,b); break; } // 같은 공은 닿기만 해도 합체
          if(d>=m||d===0) continue;
          const nx=dx/d, ny=dy/d, ov=m-d, ma=a.r*a.r*a.r, mb=b.r*b.r*b.r;
          a.touch=b.touch=true;
          // 겹친 만큼 밀어냄 — 가벼운 쪽이 더 많이 밀림(무거운 공이 내려앉으며 작은 공을 비켜냄)
          const pc=Math.min(ov,S.W*0.03)*0.85;
          a.x-=nx*pc*mb/(ma+mb); a.y-=ny*pc*mb/(ma+mb); b.x+=nx*pc*ma/(ma+mb); b.y+=ny*pc*ma/(ma+mb);
          const rv=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
          if(rv<0){ const e=rv<-S.H*0.12?SK_E:0.05; // 세게 부딪히면 튕기고, 살살 닿아 있으면 거의 안 튕김(떨림 방지)
            const jj=-(1+e)*rv/(1/ma+1/mb); a.vx-=jj/ma*nx; a.vy-=jj/ma*ny; b.vx+=jj/mb*nx; b.vy+=jj/mb*ny; }
          // 맞닿은 면의 마찰 — 접선 방향 상대 속도(회전 포함)를 일부 줄이며 서로 돌림
          const tx=-ny, ty=nx, vt=(b.vx-a.vx)*tx+(b.vy-a.vy)*ty-(a.w||0)*a.r-(b.w||0)*b.r;
          const jt=-vt/(3*(1/ma+1/mb))*0.3;
          a.vx-=jt/ma*tx; a.vy-=jt/ma*ty; b.vx+=jt/mb*tx; b.vy+=jt/mb*ty;
          a.w=(a.w||0)-2*jt/(ma*a.r); b.w=(b.w||0)-2*jt/(mb*b.r);
        } }
      S.balls=S.balls.filter(b=>!b.dead);
    }
    // 충돌 정리 뒤 다시 상자 안으로, 거의 멈춘 공은 더 빨리 가라앉혀 제자리 떨림 방지
    for(const b of S.balls){
      if(b.x<S.L+b.r) b.x=S.L+b.r; if(b.x>S.R-b.r) b.x=S.R-b.r; if(b.y>S.F-b.r){ b.y=S.F-b.r; if(b.vy>0) b.vy=0; }
      if(b.touch&&Math.hypot(b.vx,b.vy)<S.H*0.07){ b.vx*=0.9; b.vy*=0.9; b.w*=0.9; } // 바닥·다른 공에 닿아 있는 공만(떨어지는 공은 그대로 가속)
    }
  }
  function skMerge(a,b){
    a.dead=b.dead=true;
    const t=a.t+1, x=(a.x+b.x)/2, y=(a.y+b.y)/2;
    suika.maxT=Math.max(suika.maxT||0,Math.min(t,SK_NAMES.length-1));
    if(t>=SK_NAMES.length){ suika.score+=100; suika.flash={text:'🎉 신동준 합체! +100',until:performance.now()+1500}; }
    else { suika.score+=t*(t+1)/2; const nr=skR(t);
      suika.balls.push({id:++suika.id,x,y,vx:(a.vx+b.vx)/2,vy:(a.vy+b.vy)/2,r:nr,t,age:1.3,a:((a.a||0)+(b.a||0))/2,w:((a.w||0)+(b.w||0))/2});
      // 합체 순간 커진 공이 자리를 차지하며 주변 공을 옆으로 살짝 밀어냄
      suika.balls.forEach(o=>{ if(o.dead||o===a||o===b) return; const dx=o.x-x, dy=o.y-y, d=Math.hypot(dx,dy)||1, reach=nr+o.r+suika.W*0.04;
        if(d<reach){ const k=(1-d/reach)*suika.H*0.8*Math.min(1,(nr/o.r)*0.6); o.vx+=dx/d*k; o.vy+=Math.min(0,dy/d*k*0.3); } }); // 옆으로 살짝 비켜나기만
      if(t>=5) suika.flash={text:`${SK_NAMES[t]} 등장!`,until:performance.now()+1200}; }
    const sc=el('gmSkScore'); if(sc) sc.textContent=suika.score.toLocaleString();
  }
  function skEnd(why){
    if(!suika||suika.over) return;
    suika.over=true;
    const n=suika.score, exp=miniExp(n,SUIKA_BASE,st.suikaLv,1+1.3*(suika.maxT||0)); // 수박 장인으로 증가, 큰 공을 만들수록 한도 증가(신동준 약 10레벨)
    const best=n>(acc.suikaBest||0); if(best) acc.suikaBest=n;
    if(exp>0) gainExp(exp);
    dirty=true; saveServer(true);
    const info=el('gmSkInfo');
    if(info) info.innerHTML=`${why} <b>${n.toLocaleString()}점</b> · 경험치 +${fmt(exp)}${best&&n?' · 🎉 최고 기록!':''}<br><small>${isTouchDevice()?'탭':'Space 또는 클릭'}하면 다시 시작</small>`;
    if(el('gmSkBest')) el('gmSkBest').textContent=(acc.suikaBest||0).toLocaleString();
  }
  function skBall(g,b,t,x,y,r,alpha){
    const im=suika.imgs[t];
    g.save(); g.globalAlpha=alpha;
    g.translate(x,y); g.rotate(b&&b.a||0); // 굴러간 만큼 얼굴도 회전
    g.beginPath(); g.arc(0,0,r,0,Math.PI*2); g.closePath(); g.fillStyle='#f1ede8'; g.fill();
    if(im&&im.complete&&im.naturalWidth){ g.save(); g.clip(); g.drawImage(im,-r,-r,r*2,r*2); g.restore(); }
    else { g.fillStyle=SK_COLORS[t]; g.fill(); g.fillStyle='#fff'; g.font=`bold ${Math.round(r*0.55)}px sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText(SK_NAMES[t].slice(1),0,0); }
    g.lineWidth=Math.max(3,r*0.09)+3; g.strokeStyle='rgba(255,255,255,0.9)'; g.stroke();
    g.lineWidth=Math.max(3,r*0.09); g.strokeStyle=SK_COLORS[t]; g.stroke();
    g.restore();
  }
  function skDraw(){
    const cv=el('gmSkCv'); if(!cv) return;
    const g=cv.getContext('2d'), S=suika; g.clearRect(0,0,S.W,S.H);
    const bg=art('suika-bg.jpg'); if(artReady(bg)) drawCover(g,bg,S.W,S.H); // 과수원 나무 상자 배경
    const line=S.T;
    // 상자 바깥은 어둡게 — 공이 노는 곳이 잘 보이게
    g.fillStyle='rgba(0,0,0,0.32)'; g.fillRect(0,0,S.L,S.H); g.fillRect(S.R,0,S.W-S.R,S.H); g.fillRect(S.L,S.F,S.R-S.L,S.H-S.F);
    g.strokeStyle='rgba(255,240,210,0.55)'; g.lineWidth=3; g.strokeRect(S.L,-4,S.R-S.L,S.F+4);
    // 넘침 선 — 위험할 땐 빨갛게 깜빡
    const warn=S.danger>0&&Math.floor(performance.now()/200)%2===0;
    g.save(); g.setLineDash([16,10]); g.lineWidth=5; g.strokeStyle='rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(S.L,line+2); g.lineTo(S.R,line+2); g.stroke();
    g.lineWidth=3; g.strokeStyle=S.danger>0?(warn?'#ff3b30':'#ffd166'):'rgba(255,255,255,0.85)'; g.beginPath(); g.moveTo(S.L,line); g.lineTo(S.R,line); g.stroke(); g.restore();
    if(!S.over){
      const r=skR(S.cur), x=Math.min(S.R-r,Math.max(S.L+r,S.dropX));
      g.save(); g.strokeStyle='rgba(150,150,150,0.35)'; g.lineWidth=2; g.beginPath(); g.moveTo(x,r*2+8); g.lineTo(x,S.H); g.stroke(); g.restore();
      skBall(g,null,S.cur,x,r+6,r,S.cool>0?0.45:0.95);
      // 다음 공 미리보기 (오른쪽 위)
      const nr=Math.min(skR(S.next),S.W*0.045); g.font='bold 22px sans-serif'; g.textAlign='right'; g.textBaseline='middle'; g.lineWidth=5; g.strokeStyle='rgba(0,0,0,0.55)';
      g.strokeText('다음',S.W-nr*2-22,nr+12); g.fillStyle='#fff'; g.fillText('다음',S.W-nr*2-22,nr+12); skBall(g,null,S.next,S.W-nr-10,nr+12,nr,0.9);
    }
    for(const b of S.balls) skBall(g,b,b.t,b.x,b.y,b.r,S.over?0.5:1);
    // 넘친 상태 — 다음 공을 놓으면 끝난다는 걸 알려줌
    if(!S.over&&S.danger>0){
      g.font='bold 26px sans-serif'; g.textAlign='center'; g.textBaseline='bottom'; g.lineWidth=6;
      g.strokeStyle='rgba(0,0,0,0.6)'; g.strokeText('공을 놓으면 끝!',S.W/2,line-12);
      g.fillStyle=warn?'#ff6b60':'#ffd166'; g.fillText('공을 놓으면 끝!',S.W/2,line-12);
    }
    if(S.flash){ if(performance.now()>S.flash.until) S.flash=null;
      else { g.font='bold 30px sans-serif'; g.textAlign='center'; g.textBaseline='top'; g.lineWidth=6; g.strokeStyle='rgba(0,0,0,0.55)'; g.strokeText(S.flash.text,S.W/2,line+14); g.fillStyle='#ffcf4a'; g.fillText(S.flash.text,S.W/2,line+14); } }
  }
  window.gmShowSuika=gmShowSuika;

  /* ---------- 테트리스 ---------- */
  // 10×20 판, 7종 블록(7개 묶음 무작위), 고스트(착지 위치), 다음 블록, 착지 후 0.5초 유예. 10줄마다 레벨 업(빨라짐).
  // 점수: 1·2·3·4줄 = 100·300·500·800 × 레벨, 천천히 내리기 +1/칸, 바로 내리기 +2/칸 → 점수 × 지금 단계 × 0.012 경험치
  const TT_REQ=35, TT_BASE=5000, TT_W=10, TT_H=20;
  const TT_PIECES={
    I:{n:4,c:[[0,1],[1,1],[2,1],[3,1]],col:'#4fc3f7'}, O:{n:2,c:[[0,0],[1,0],[0,1],[1,1]],col:'#ffd54f'},
    T:{n:3,c:[[1,0],[0,1],[1,1],[2,1]],col:'#ba68c8'}, S:{n:3,c:[[1,0],[2,0],[0,1],[1,1]],col:'#81c784'},
    Z:{n:3,c:[[0,0],[1,0],[1,1],[2,1]],col:'#e57373'}, J:{n:3,c:[[0,0],[0,1],[1,1],[2,1]],col:'#64b5f6'},
    L:{n:3,c:[[2,0],[0,1],[1,1],[2,1]],col:'#ffb74d'}};
  let tetris=null;
  function tetrisUnlocked(){ return acc.runs.some(r=>r&&r.lv>=TT_REQ); }
  function ttBag(){ if(!tetris.bag.length){ tetris.bag=Object.keys(TT_PIECES); for(let i=tetris.bag.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tetris.bag[i],tetris.bag[j]]=[tetris.bag[j],tetris.bag[i]]; } } return tetris.bag.pop(); }
  function ttHit(cells,x,y){ return cells.some(([cx,cy])=>{ const gx=x+cx, gy=y+cy; return gx<0||gx>=TT_W||gy>=TT_H||(gy>=0&&tetris.grid[gy][gx]); }); }
  function ttSpawn(){
    const k=tetris.next; tetris.next=ttBag();
    const P=TT_PIECES[k];
    tetris.cur={k,n:P.n,cells:P.c.map(a=>a.slice()),x:Math.floor((TT_W-P.n)/2),y:k==='I'?-1:0};
    tetris.lockT=0;
    if(ttHit(tetris.cur.cells,tetris.cur.x,tetris.cur.y)) ttEnd('더 이상 쌓을 곳이 없습니다!');
  }
  function gmShowTetris(){
    if(!tetrisUnlocked()){ toast(`🔒 과장(Lv.${TT_REQ}) 이상 달성 시 자동으로 해금됩니다`,2500); return; }
    if(tetris) cancelAnimationFrame(tetris.raf);
    const touch=isTouchDevice();
    el('gmBody').innerHTML=`
      <div class="gm-st-head"><b>${ic(IC.tetris)}테트리스</b><span>최고 <b id="gmTtBest">${(acc.tetrisBest||0).toLocaleString()}</b>점</span></div>
      <canvas class="gm-st-cv gm-tt-cv" id="gmTtCv"></canvas>
      <div class="gm-st-info" id="gmTtInfo">${touch?'아래 버튼으로 조작하세요':'← → 이동 · ↑ 회전 · ↓ 내리기 · Space 바로 내리기'}</div>
      ${touch?`<div class="gm-st-btns gm-tt-btns"><button type="button" onpointerdown="event.preventDefault();ttMove(-1)">◀</button><button type="button" onpointerdown="event.preventDefault();ttRotate(1)">⟳</button><button type="button" onpointerdown="event.preventDefault();ttMove(1)">▶</button><button type="button" onpointerdown="event.preventDefault();ttSoft()">▼</button><button type="button" onpointerdown="event.preventDefault();ttDrop()">⤓</button></div>`:''}
      <button type="button" class="gm-btn" onclick="gmTetrisExit()">${ic(IC.world)}그만하고 월드로</button>`;
    lockBodySize();
    const cv=el('gmTtCv'); cv.width=Math.round(cv.clientWidth*2)||700; cv.height=Math.round(cv.clientHeight*2)||700;
    tetris={grid:Array.from({length:TT_H},()=>Array(TT_W).fill(null)),bag:[],next:null,cur:null,score:0,lines:0,level:1,dropT:0,lockT:0,over:false,lastT:performance.now(),raf:0,flash:null};
    tetris.next=ttBag(); ttSpawn();
    tetris.raf=requestAnimationFrame(ttLoop);
    el('gmWidget').focus();
  }
  function ttMove(d){ if(!tetris||tetris.over) return; lastInput=Date.now(); const c=tetris.cur; if(!ttHit(c.cells,c.x+d,c.y)){ c.x+=d; tetris.lockT=0; ttDraw(); } }
  function ttRotate(dir){
    if(!tetris||tetris.over) return; lastInput=Date.now();
    const c=tetris.cur; if(c.k==='O') return;
    const cells=c.cells.map(([x,y])=>dir>0?[c.n-1-y,x]:[y,c.n-1-x]);
    for(const [kx,ky] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]]){ if(!ttHit(cells,c.x+kx,c.y+ky)){ c.cells=cells; c.x+=kx; c.y+=ky; tetris.lockT=0; ttDraw(); return; } }
  }
  function ttSoft(){ if(!tetris||tetris.over) return; lastInput=Date.now(); const c=tetris.cur; if(!ttHit(c.cells,c.x,c.y+1)){ c.y++; tetris.score+=1; tetris.dropT=0; ttDraw(); } }
  function ttHard(){ if(!tetris||tetris.over) return; lastInput=Date.now(); const c=tetris.cur; let n=0; while(!ttHit(c.cells,c.x,c.y+1)){ c.y++; n++; } tetris.score+=n*2; ttLock(); }
  function ttLock(){
    const t=tetris, c=t.cur, col=TT_PIECES[c.k].col;
    let out=false;
    c.cells.forEach(([cx,cy])=>{ const gy=c.y+cy; if(gy<0) out=true; else t.grid[gy][c.x+cx]=c.k; });
    if(out){ ttEnd('천장까지 쌓였습니다!'); return; }
    const full=t.grid.map((r,i)=>r.every(Boolean)?i:-1).filter(i=>i>=0);
    if(full.length){
      t.grid=t.grid.filter((r,i)=>!full.includes(i)); while(t.grid.length<TT_H) t.grid.unshift(Array(TT_W).fill(null));
      t.score+=[0,100,300,500,800][full.length]*t.level; t.lines+=full.length;
      const lv=1+Math.floor(t.lines/10); if(lv>t.level){ t.level=lv; t.flash={text:`레벨 ${lv}!`,until:performance.now()+1200}; }
      else if(full.length===4) t.flash={text:'🧱 테트리스! +'+(800*t.level),until:performance.now()+1200};
    }
    ttSpawn(); ttDraw();
  }
  function ttLoop(){
    const t=tetris; if(!t||!el('gmTtCv')){ tetris=null; return; }
    const now=performance.now(), dt=Math.max(0,Math.min(0.05,(now-t.lastT)/1000)); t.lastT=now;
    if(!t.over){
      const c=t.cur, interval=Math.max(0.06,0.8-(t.level-1)*0.07);
      if(ttHit(c.cells,c.x,c.y+1)){ t.lockT+=dt; if(t.lockT>0.5) ttLock(); } // 바닥에 닿으면 0.5초 유예 후 고정
      else { t.lockT=0; t.dropT+=dt; if(t.dropT>=interval){ t.dropT=0; c.y++; } }
    }
    ttDraw();
    t.raf=requestAnimationFrame(ttLoop);
  }
  function ttEnd(why){
    const t=tetris; if(!t||t.over) return;
    t.over=true;
    const n=t.score, exp=miniExp(n,TT_BASE,st.tetrisLv,Math.max(1,t.level)); // 테트리스 고수로 증가, 테트리스 단계 수만큼 한도(10단계 → 10레벨)
    const best=n>(acc.tetrisBest||0); if(best) acc.tetrisBest=n;
    if(exp>0) gainExp(exp);
    dirty=true; saveServer(true);
    const info=el('gmTtInfo');
    if(info) info.innerHTML=`${why} <b>${n.toLocaleString()}점</b> · ${t.lines}줄 · 경험치 +${fmt(exp)}${best&&n?' · 🎉 최고 기록!':''}<br><small>${isTouchDevice()?'⤓ 버튼':'Space'}으로 다시 시작</small>`;
    if(el('gmTtBest')) el('gmTtBest').textContent=(acc.tetrisBest||0).toLocaleString();
  }
  // 블록 한 칸 — 젤리 블록 그림(없으면 색 칸)
  function ttCell(g,x,y,s,k,alpha){
    g.globalAlpha=alpha; const im=art('tt-'+k+'.png');
    if(artReady(im)) g.drawImage(im,x,y,s,s);
    else { g.fillStyle=TT_PIECES[k].col; g.fillRect(x+1,y+1,s-2,s-2); g.fillStyle='rgba(255,255,255,0.28)'; g.fillRect(x+1,y+1,s-2,Math.max(2,s*0.18)); }
    g.globalAlpha=1;
  }
  function ttDraw(){
    const cv=el('gmTtCv'); if(!cv||!tetris) return;
    const t=tetris, g=cv.getContext('2d'), W=cv.width, H=cv.height;
    g.clearRect(0,0,W,H);
    const cs=Math.floor(Math.min((H-16)/TT_H,(W*0.66)/TT_W)), bw=cs*TT_W, bh=cs*TT_H, bx=12, by=Math.floor((H-bh)/2);
    const line='rgba(255,255,255,0.07)', text='rgba(230,235,255,0.72)', strong='#ffffff'; // 밤 배경 위라 테마와 상관없이 밝은 글자
    const bgi=art('tetris-bg.jpg'); if(artReady(bgi)) drawCover(g,bgi,W,H); // 밤 사무실 창밖 배경
    g.fillStyle='rgba(8,12,30,0.72)'; g.fillRect(bx,by,bw,bh);
    g.strokeStyle='rgba(140,170,255,0.55)'; g.lineWidth=3; g.strokeRect(bx-1.5,by-1.5,bw+3,bh+3);
    g.strokeStyle=line; g.lineWidth=1;
    for(let i=0;i<=TT_W;i++){ g.beginPath(); g.moveTo(bx+i*cs+0.5,by); g.lineTo(bx+i*cs+0.5,by+bh); g.stroke(); }
    for(let j=0;j<=TT_H;j++){ g.beginPath(); g.moveTo(bx,by+j*cs+0.5); g.lineTo(bx+bw,by+j*cs+0.5); g.stroke(); }
    t.grid.forEach((r,y)=>r.forEach((k,x)=>{ if(k) ttCell(g,bx+x*cs,by+y*cs,cs,k,t.over?0.45:1); }));
    if(!t.over&&t.cur){
      const c=t.cur, col=TT_PIECES[c.k].col; let gy=c.y; while(!ttHit(c.cells,c.x,gy+1)) gy++;
      c.cells.forEach(([cx,cy])=>{ if(gy+cy>=0){ g.strokeStyle=col; g.lineWidth=2; g.strokeRect(bx+(c.x+cx)*cs+3,by+(gy+cy)*cs+3,cs-6,cs-6); } }); // 고스트
      c.cells.forEach(([cx,cy])=>{ if(c.y+cy>=0) ttCell(g,bx+(c.x+cx)*cs,by+(c.y+cy)*cs,cs,c.k,1); });
    }
    // 오른쪽 — 다음 블록, 점수
    const px=bx+bw+18, pw=W-px-10;
    g.fillStyle='rgba(8,12,30,0.6)'; g.fillRect(px-8,by,pw+4,cs*10.6); // 점수판 바탕
    g.fillStyle=text; g.font=`bold ${Math.round(cs*0.62)}px sans-serif`; g.textAlign='left'; g.textBaseline='top';
    g.fillText('다음',px,by);
    const N=TT_PIECES[t.next], ns=Math.min(Math.floor(pw/4.5),cs);
    N.c.forEach(([x,y])=>ttCell(g,px+x*ns,by+cs*1.1+y*ns,ns,t.next,1));
    const rows=[['점수',t.score.toLocaleString()],['줄',t.lines],['레벨',t.level]];
    rows.forEach(([k,v],i)=>{ const y=by+cs*4.2+i*cs*2.1; g.fillStyle=text; g.font=`${Math.round(cs*0.55)}px sans-serif`; g.fillText(k,px,y);
      g.font=`bold ${Math.round(cs*0.75)}px sans-serif`; g.fillStyle=strong; g.fillText(String(v),px,y+cs*0.75); });
    if(t.flash){ if(performance.now()>t.flash.until) t.flash=null;
      else { g.font=`bold ${Math.round(cs*0.9)}px sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.lineWidth=6; g.strokeStyle='rgba(0,0,0,0.6)'; g.strokeText(t.flash.text,bx+bw/2,by+bh*0.35); g.fillStyle='#ffcf4a'; g.fillText(t.flash.text,bx+bw/2,by+bh*0.35); } }
  }
  window.gmShowTetris=gmShowTetris;
  window.ttMove=ttMove; window.ttRotate=ttRotate; window.ttSoft=ttSoft; window.ttHard=ttHard;
  window.ttDrop=()=>{ lastInput=Date.now(); if(tetris&&tetris.over) gmShowTetris(); else ttHard(); };
  window.gmTetrisExit=function(){ if(tetris){ cancelAnimationFrame(tetris.raf); if(!tetris.over&&tetris.score>0) ttEnd('그만함'); } tetris=null; gmShowWorld(); };

  /* ---------- 미니게임 월드 ---------- */
  // 구름 섬 지도. 열린 섬은 둥실둥실 + 최고 기록, 잠긴 섬은 안개 + 🔒(누르면 해금 직급 안내). 준비 중 섬으로 다음 게임 예고
  // pos: 지도 그림(world-map.jpg) 안 빈 섬의 위치(가로·세로 비율). 본사 섬에서 점선을 따라 계단 → 수박 → 테트리스
  const WORLD=[
    {id:'stairs',icon:'🪜',name:'무한의 계단',req:STAIRS_REQ,best:()=>(acc.stairsBest||0).toLocaleString()+'층',go:()=>gmShowStairs(),pos:[0.645,0.545],img:'isle-stairs.png',ar:1.42,top:0.62},
    {id:'suika', icon:'🍉',name:'수박 게임',  req:SUIKA_REQ, best:()=>(acc.suikaBest||0).toLocaleString()+'점', go:()=>gmShowSuika(), pos:[0.32,0.345],img:'isle-suika.png',ar:1.07,top:0.45},
    {id:'tetris',icon:'🧱',name:'테트리스',   req:TT_REQ,    best:()=>(acc.tetrisBest||0).toLocaleString()+'점',go:()=>gmShowTetris(),pos:[0.645,0.16],img:'isle-tetris.png',ar:1.11,top:0.45},
    {id:'soon',  icon:'❓',name:'준비 중',    req:null,      best:()=>'',go:null,pos:[0.19,0.13],img:'isle-soon.png',ar:1.0,top:0.45,size:0.22},
  ];
  const MAP_W=760, MAP_H=1064; // world-map.jpg 크기
  // 지도 그림을 영역에 꽉 채웠을 때(cover, 세로는 위쪽 20% 기준 — CSS background-position과 같게) 섬 위치를 화면 좌표로.
  // 섬 그림은 잔디 윗면(top: 그림 높이 대비 위치)이 지도 속 빈 섬 위에 오도록 배치
  function placeIsles(){
    const box=el('gmWorld'); if(!box) return;
    const W=box.clientWidth, H=box.clientHeight, k=Math.max(W/MAP_W,H/MAP_H), ox=(W-MAP_W*k)/2, oy=(H-MAP_H*k)*0.2;
    box.querySelectorAll('.gm-isle').forEach(b=>{ const w=WORLD[+b.dataset.i], x=ox+w.pos[0]*MAP_W*k, y=oy+w.pos[1]*MAP_H*k;
      if(w.img){ const iw=Math.round((w.size||0.30)*MAP_W*k); b.style.width=iw+'px'; b.style.left=(x-iw/2)+'px'; b.style.top=(y-iw*w.ar*w.top)+'px'; }
      else { b.style.left=x+'px'; b.style.top=y+'px'; } });
  }
  function gmShowWorld(){
    if(stairs){ cancelAnimationFrame(stairs.raf); stairs=null; } if(suika){ cancelAnimationFrame(suika.raf); suika=null; } if(tetris){ cancelAnimationFrame(tetris.raf); tetris=null; }
    const open=w=>w.req!=null&&acc.runs.some(r=>r&&r.lv>=w.req);
    el('gmBody').innerHTML=`
      <div class="gm-st-head"><b>${ic(IC.world)}미니게임 월드</b><span>경험치는 지금 키우는 직원에게</span></div>
      <div class="gm-world" id="gmWorld">
        <i class="gm-cloud c1"></i><i class="gm-cloud c2"></i><i class="gm-cloud c3"></i>
        ${WORLD.map((w,i)=>{ const o=open(w), soon=w.req==null;
          return `<button type="button" class="gm-isle${o?'':' locked'}${soon?' soon':''}${w.img?' art':''}" data-i="${i}" style="animation-delay:${-i*0.7}s" onclick="gmWorldGo(${i})">
            ${w.img?`<img class="gm-isle-art" src="${UI}${w.img}" alt=""/>`:`<span class="gm-isle-icon">${w.icon}</span>`}
            <span class="gm-isle-label"><b>${o||soon?'':ic('lock.png')}${w.name}</b><small>${soon?'곧 추가됩니다':o?'최고 '+w.best():`${rankOf(w.req)[2]} 이상 해금`}</small></span>
            ${o||soon?'':'<i class="gm-isle-fog"></i>'}</button>`; }).join('')}
      </div>
      <div class="gm-st-info" id="gmWorldMsg">섬을 눌러 미니게임에 들어가세요</div>
      <button type="button" class="gm-btn" onclick="gmBack()">돌아가기</button>`;
    lockBodySize();
    placeIsles();
  }
  window.gmShowWorld=gmShowWorld;
  window.gmWorldGo=function(i){
    const w=WORLD[i], msg=el('gmWorldMsg');
    lastInput=Date.now();
    if(w.req==null){ if(msg) msg.textContent='❓ 다음 미니게임은 곧 추가됩니다!'; return; }
    if(!acc.runs.some(r=>r&&r.lv>=w.req)){
      if(msg) msg.innerHTML=`${ic('lock.png')}<b>'${rankOf(w.req)[2]}'</b> 이상 달성 시 자동으로 해금됩니다.`;
      const b=document.querySelectorAll('.gm-isle')[i]; if(b){ b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
      return;
    }
    w.go();
  };
  window.gmSuikaExit=function(){ if(suika){ cancelAnimationFrame(suika.raf); if(!suika.over&&suika.score>0) skEnd('그만함'); } suika=null; gmShowWorld(); };
  document.addEventListener('keyup',e=>{ if(!suika) return; if(['ArrowLeft','KeyA'].includes(e.code)) suika.keys.L=false; if(['ArrowRight','KeyD'].includes(e.code)) suika.keys.R=false; });
  window.gmStep=gmStep;
  window.gmStairsExit=function(){ if(stairs){ cancelAnimationFrame(stairs.raf); if(stairs.running) stairsEnd('그만 오름'); } stairs=null; gmShowWorld(); };
  // 직원(캐릭터) 목록 — 해금 상태와 진행, 바꾸기
  function gmShowChars(){
    const hire=canHire();
    el('gmBody').innerHTML=`<div class="gm-rank-title">${ic(IC.staff)}직원 <small>${hire?ic('ticket.png')+'입사권 1장 — 원하는 직원을 고르세요':'사장 1명 달성마다 원하는 직원 1명 입사'}</small></div>`+
      CHARS.map((c,i)=>{
        const r=acc.runs[i], open=!!r||hire, cur=i===acc.ch;
        const diff=`업무량 ×${fmt(Math.pow(HP_STEP,r?r.tier:hiredCount()))}`;
        const info=r?`${rankBadge(r.lv,'gm-row-badge')}${rankOf(r.lv)[2]} Lv.${r.lv} · ${r.stage}단계${r.done?' · 🚀 사장 달성':''}`:hire?ic('ticket.png')+'눌러서 입사시키기':ic('lock.png')+'사장을 달성하면 입사 가능';
        return `<button type="button" class="gm-char-row${cur?' cur':''}${open?'':' locked'}" ${open&&!cur?`onclick="gmSwitchChar(${i})"`:'disabled'}>
          <span class="gm-avatar">${faceHtml(i)}</span>
          <span class="gm-char-row-text"><b>${escHtml(c.name)}${cur?' (키우는 중)':''}</b><small>${info}</small></span>
          <span class="gm-char-row-diff">${diff}</span></button>`;
      }).join('')+'<button type="button" class="gm-btn" onclick="gmBack()">돌아가기</button>';
    lockBodySize();
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
    // 서버 진행이 기준(항상 마지막으로 로그인한 기기만 저장할 수 있음). 서버에 아직 없을 때만 이 기기 저장 사용
    const pick=j.state||localSt;
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
  if(window.__GM_TEST) window.__gmCheer=function(ch){ // 자동 테스트에서 격려를 강제로 걸어봄
    const c=CHARS[ch||0]; if(!c||!c.cheer) return null;
    cheer={ch:ch||0,def:c.cheer,until:Date.now()+c.cheer.sec*1000}; render(); return cheer;
  };
  window.gmShowRanking=gmShowRanking;
  window.gmShowChars=gmShowChars;
  window.gmSwitchChar=switchChar;
  window.gmBack=function(){ if(stairs){ cancelAnimationFrame(stairs.raf); stairs=null; } if(suika){ cancelAnimationFrame(suika.raf); suika=null; } if(tetris){ cancelAnimationFrame(tetris.raf); tetris=null; } renderPlay(); focusPlay(); };
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
  window.gmToggleDim=function(){ const b=el('gmOpBar'); if(b) b.style.display=b.style.display==='none'?'':'none'; };

  // 키보드 — 게임 창에 포커스가 있을 때만(대시보드 입력칸 타이핑과 섞이지 않게). Esc는 보스 키
  document.addEventListener('keydown',e=>{
    if(!opened||!isVisible()) return;
    if(e.key==='Escape'){ gmHide(); return; }
    if(!hasFocus()||e.target.tagName==='INPUT') return;
    if(tetris&&el('gmTtCv')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      lastInput=Date.now();
      const c=e.code, once=!e.repeat;
      if(['ArrowLeft','KeyA'].includes(c)){ e.preventDefault(); ttMove(-1); }
      else if(['ArrowRight','KeyD'].includes(c)){ e.preventDefault(); ttMove(1); }
      else if(['ArrowDown','KeyS'].includes(c)){ e.preventDefault(); ttSoft(); }
      else if(['ArrowUp','KeyX','KeyW'].includes(c)){ e.preventDefault(); if(once) ttRotate(1); }
      else if(c==='KeyZ'){ e.preventDefault(); if(once) ttRotate(-1); }
      else if(['Space','Enter'].includes(c)){ e.preventDefault(); if(once){ if(tetris.over) gmShowTetris(); else ttHard(); } }
      return;
    }
    if(suika&&el('gmSkCv')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      lastInput=Date.now();
      if(['ArrowLeft','KeyA'].includes(e.code)){ e.preventDefault(); suika.keys.L=true; }
      else if(['ArrowRight','KeyD'].includes(e.code)){ e.preventDefault(); suika.keys.R=true; }
      else if(['Space','ArrowDown','Enter','KeyS'].includes(e.code)){ e.preventDefault(); if(e.repeat) return; if(suika.over) gmShowSuika(); else skDrop(); }
      return;
    }
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
      if(pid&&token) loadServer(); // 돌아오면 바로 서버 확인 — 다른 기기에서 로그인했으면 즉시 로그아웃, 더 최신 진행이면 불러옴
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
