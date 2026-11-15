(() => {
'use strict';
const root=document.getElementById('roadlog-app'), main=document.getElementById('rl-content'), notice=document.getElementById('rl-notice');
const bridge=window.RoadlogNative;
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols={
  stars:'<path d="M13 2q1.2 6.4 7.3 7.4Q14.2 10.6 13 17q-1.3-6.4-7.3-7.6Q11.7 8.4 13 2Z"/><path d="M5.5 15q.5 2.8 3.3 3.3-2.8.5-3.3 3.3-.5-2.8-3.3-3.3 2.8-.5 3.3-3.3Z"/>',
  folder:'<path d="M3 6a1 1 0 0 1 1-1h5l2.2 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  route:'<circle cx="5" cy="17" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 17h6a3 3 0 1 0 0-6h-2a2.5 2.5 0 0 1 0-5h6"/>',
  go:'<path d="m8 5 7 7-7 7"/>',back:'<path d="m15 5-7 7 7 7"/>',
  add:'<path d="M12 5v14M5 12h14"/>',edit:'<path d="m4 15-1 6 6-1L20 9l-5-5zM12 7l5 5"/>',
  share:'<path d="M12 15V3m-4 4 4-4 4 4M5 13v7h14v-7"/>',
  fit:'<circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',minus:'<path d="M5 12h14"/>',globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>'
};
const icon=key=>'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+symbols[key]+'</svg>';
function button(text,action,style='',symbol=''){return '<button type="button" class="btn '+style+'" data-action="'+action+'">'+(symbol?icon(symbol):'')+text+'</button>';}
function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch(_){return fallback;}}
let trips=[],entries={},cachedRaw='',snapshot={},focused=null,tab='home',origin='home',mode='sky',collectionView='list',dialog=null,toastTimer;
let journalReady=!bridge;
const shapes=new Map(), storageKey='starroad-sky/entries';
let courses, folderFilter='*',skyPeriod='all',skyOffset=0,renderedPeriodStart=0;
const periods={week:'주간',month:'월간',year:'연간',all:'전체'};
const folders=()=>entries['@folders']||{};
function currentRange(){return NightSky.periodRange(skyPeriod,skyOffset);}
function skyCourses(range=currentRange()){return NightSky.view(courses ||= NightSky.groups(trips,shape),range);}
function groupTitle(g){return entry(g.trip).constellationName || g.variants[0].trips.map(t=>entry(t).constellationName).find(Boolean) || NightSky.title(g.trip);}
function writeEntries(next){localStorage.setItem(storageKey,JSON.stringify(next));entries=next;}
function loadJournal(){
  journalReady=false;
  const raw=bridge.getJournal();
  if(!raw)throw Error('journal');
  entries=JSON.parse(raw);
  journalReady=true;
}
const entry=t=>entries[t.id]||{};
function shape(t){if(!shapes.has(t.id))shapes.set(t.id,StarGeometry.build(t));return shapes.get(t.id);}
const saved=t=>!!entry(t).starred && shape(t).count>0;
const selected=()=>trips.find(t=>t.id===focused) || trips.find(t=>shape(t).count) || trips[0];
function routeName(t){return NightSky.places(t).filter(Boolean).join(' → ') || NightSky.title(t);}
function title(t){return entry(t).constellationName || NightSky.title(t);}
function distance(t){const n=Number(t.km);if(!Number.isFinite(n)||n<0)return '—';return n>0&&n<1?Math.round(n*1000)+' m':Number(n.toFixed(1)).toLocaleString('ko-KR')+' km';}
function duration(t){const n=Math.max(0,Math.round(t.seconds || 0));if(n<60)return n+'초';const m=Math.floor(n/60);return m>=60?Math.floor(m/60)+'시간'+(m%60?' '+m%60+'분':''):m+'분'+(n%60?' '+n%60+'초':'');}
function date(t){return t.date || '날짜 미상';}
function departure(t){
  const start=t.startedAt>0?t.startedAt:t.points?.[0]?.at;
  const stamp=new Date(start);
  if(!(start>0) || !Number.isFinite(stamp.getTime()))return date(t);
  return date(t)+' '+[stamp.getHours(),stamp.getMinutes()].map(n=>String(n).padStart(2,'0')).join(':');
}
function locked(){return !!bridge && (snapshot.restricted || !!snapshot.active);}
function tell(text){clearTimeout(toastTimer);notice.textContent=text;toastTimer=setTimeout(()=>notice.textContent='',3800);}
function persist(t,name,collected,folder='',newFolder='') {
  try{
    if(bridge){
      const ok=collected?bridge.fileConstellation(t.id,name,folder,newFolder):bridge.saveConstellation(t.id,name,false);
      if(!ok)throw Error();
      loadJournal();
    }else{
      const next=readLocal(storageKey,entries), list=next['@folders']||{};
      if(newFolder){
        if(Object.values(list).some(n=>n.toLocaleLowerCase()===newFolder.toLocaleLowerCase()))throw Error();
        folder=folderId();next['@folders']={...list,[folder]:newFolder};
      }else if(collected && !Object.hasOwn(list,folder))throw Error();
      const item={...(next[t.id]||entry(t))};
      if(name)item.constellationName=name;else delete item.constellationName;
      if(collected)item.starred=true;else delete item.starred;
      if(collected && folder)item.folder=folder;else delete item.folder;
      if(Object.keys(item).length)next[t.id]=item;else delete next[t.id];
      writeEntries(next);
    }
    return true;
  }catch(_){tell('저장하지 못했어요. 주차 상태와 폴더를 확인해 주세요.');return false;}
}
function folderId(){return globalThis.crypto?.randomUUID?.()||'f-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
function editFolder(id,name,remove=false) {
  if(locked())return false;
  try{
    if(bridge){
      const ok=id?(remove?bridge.removeSkyFolder(id):bridge.renameSkyFolder(id,name)):bridge.createSkyFolder(name);
      if(!ok)throw Error();
      loadJournal();
      if(!id)folderFilter=ok;
    }else{
      const next=readLocal(storageKey,entries),list={...next['@folders']};
      if(id && !Object.hasOwn(list,id))throw Error();
      if(remove){
        delete list[id];
        for(const [key,item] of Object.entries(next))if(key!=='@folders' && item.folder===id){delete item.folder;}
      }else{
        if(Object.entries(list).some(([k,n])=>k!==id && n.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error();
        if(!id){id=folderId();folderFilter=id;}list[id]=name;
      }
      if(Object.keys(list).length)next['@folders']=list;else delete next['@folders'];
      writeEntries(next);
    }
    if(remove)folderFilter='*';
    return true;
  }catch(_){tell('폴더를 저장하지 못했어요. 이름을 확인해 주세요.');return false;}
}
function closeDialog(){if(dialog){dialog.close();dialog.remove();dialog=null;}}
function modal(markup){
  closeDialog();dialog=document.createElement('dialog');dialog.className='sky-dialog';dialog.innerHTML=markup;
  if(dialog.querySelector('h2')){dialog.querySelector('h2').id='sky-dialog-heading';dialog.setAttribute('aria-labelledby','sky-dialog-heading');}
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
  root.append(dialog);dialog.showModal();return dialog;
}
function validFolder(input,id=''){
  const name=input.value.trim();
  const duplicate=Object.entries(folders()).some(([key,n])=>key!==id && n.toLocaleLowerCase()===name.toLocaleLowerCase());
  input.setCustomValidity(!name?'폴더 이름을 입력해 주세요.':duplicate?'이미 같은 이름의 폴더가 있어요.':'');
  return input.reportValidity();
}
function nameEditor(t){
  const box=modal('<form><h2>주행 이름 변경</h2><label for="drive-name">이름</label><input id="drive-name" name="name" maxlength="40" required autocomplete="off" value="'+safe(title(t).slice(0,40))+'"><div class="actions">'+button('취소','cancel')+'<button class="btn primary" type="submit">저장</button></div></form>');
  const form=box.querySelector('form'), field=form.elements.name;
  field.focus();field.select();
  field.oninput=()=>field.setCustomValidity('');
  form.onsubmit=e=>{
    e.preventDefault();
    const name=field.value.trim();
    if(!name){field.setCustomValidity('이름을 입력해 주세요.');field.reportValidity();return;}
    if(locked())return;
    try{
      if(bridge){
        if(!bridge.renameDrive(t.id,name))throw Error();
        loadJournal();
      }else{
        const next=readLocal(storageKey,entries);
        next[t.id]={...(next[t.id]||entry(t)),constellationName:name};
        writeEntries(next);
      }
      closeDialog();render();
    }catch(_){tell('이름을 저장하지 못했어요. 주차 후 다시 시도해 주세요.');}
  };
}
function editor(t){
  const edit=saved(t), current=edit?(entry(t).folder||''):(folders()[folderFilter]?folderFilter:'');
  const options=Object.entries(folders()).map(([id,name])=>'<option value="'+safe(id)+'" '+(current===id?'selected':'')+'>'+safe(name)+'</option>').join('');
  const picker=options?'<label for="sky-folder">폴더</label><select id="sky-folder" name="folder">'+options+'<option value="+">새 폴더 만들기…</option></select>':'';
  const box=modal('<form><h2>'+(edit?'폴더 변경':'보관함에 담기')+'</h2><p>'+safe(title(t))+'</p>'+picker+'<div class="create-inline"><label for="sky-new-folder">새 폴더 이름</label><input id="sky-new-folder" maxlength="32" name="newFolder" autocomplete="off"></div><div class="actions">'+button('취소','cancel')+'<button class="btn primary" type="submit">'+(edit?'저장':'담기')+'</button></div></form>');
  const f=box.querySelector('form'), fields=f.elements;
  const creating=()=>!fields.folder || fields.folder.value==='+';
  function showDestination(){
    const make=creating();
    box.querySelector('.create-inline').hidden=!make;
    fields.newFolder.disabled=!make;
    (make?fields.newFolder:fields.folder).focus();
  }
  if(fields.folder)fields.folder.onchange=showDestination;
  showDestination();
  f.onsubmit=e=>{
    e.preventDefault();
    const isNew=creating();
    if(isNew && !validFolder(fields.newFolder))return;
    if(!locked() && persist(t,entry(t).constellationName||'',true,isNew?'':fields.folder.value,isNew?fields.newFolder.value.trim():'')){
      closeDialog();render();tell(edit?'폴더를 변경했어요.':'보관함에 담았어요.');
    }
  };
  fields.newFolder.oninput=()=>fields.newFolder.setCustomValidity('');
}
function folderEditor(id='',remove=false){
  const box=modal(remove?'<h2>폴더를 삭제할까요?</h2><p>'+safe(folders()[id])+'에 담긴 주행은 보관함의 전체 목록에서 볼 수 있어요.</p><div class="actions">'+button('취소','cancel')+button('폴더 삭제','confirmDelete','primary')+'</div>':
    '<form><h2>'+(id?'폴더 이름 변경':'새 폴더')+'</h2><label for="folder-title">폴더 이름</label><input id="folder-title" name="title" maxlength="32" autocomplete="off" required value="'+safe(folders()[id]||'')+'"><div class="actions">'+button('취소','cancel')+'<button class="btn primary" type="submit">'+(id?'저장':'만들기')+'</button></div></form>');
  if(remove){box.querySelector('[data-action=confirmDelete]').onclick=()=>{if(editFolder(id,'',true)){closeDialog();render();}};return;}
  const f=box.querySelector('form'),input=f.elements.title;input.focus();input.select();input.oninput=()=>input.setCustomValidity('');
  f.onsubmit=e=>{e.preventDefault();if(validFolder(input,id) && editFolder(id,input.value.trim())){closeDialog();render();}};
}
function share(t){
  const s=shape(t), name=title(t), route=routeName(t);
  const canvas=StarArt.poster(t,s,name,route===name?'':route);
  const box=modal('<h2>별자리 공유</h2><div class="poster"></div><div class="actions">'+button('닫기','cancel')+button('공유하기','sendShare','primary','share')+'</div>');
  box.querySelector('.poster').append(canvas);
  box.querySelector('[data-action=sendShare]').onclick=async()=>{
    if(locked())return;
    if(bridge){bridge.shareImage(canvas.toDataURL('image/png'));return;}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)return;
    const file=new File([blob],'StarRoad.png',{type:'image/png'});
    try{
      if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:title(t)});
      else {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
    }catch(error){if(error.name!=='AbortError')tell('공유할 수 없습니다.');}
  };
}
function controls(collection=false,hasShape=true){
  const tool=(attr,label,key)=>'<button type="button" '+attr+' aria-label="'+label+'" title="'+label+'">'+icon(key)+'</button>';
  return '<section class="map-frame" data-mode="'+mode+'" aria-label="주행 지도"><div class="map-canvas"></div>'+
    (!collection && hasShape?'<div class="map-switch"><button type="button" data-map-mode="sky">'+icon('stars')+'별자리</button><button type="button" data-map-mode="road">'+icon('route')+'주행 경로</button></div>':'')+
    '<div class="map-tools">'+tool('data-map-in','지도 확대','add')+tool('data-map-out','지도 축소','minus')+tool('data-map-fit','지도 전체 보기','fit')+
    (collection?'':tool('data-map-online','온라인 도로 지도 전환','globe'))+'</div><span class="map-message" role="status"></span></section>';
}
function map(items,atlas=false) {
  const node=main.querySelector('.map-canvas');if(!node)return;
  RoadlogMap.show(node,items.map(trip=>({trip,shape:shape(trip)})),{mode:atlas?'sky':mode,atlas,onMode:m=>mode=m,onOpen:atlas?id=>open(id,'collection'):null});
}
function row(t,asCard=false){
  const s=shape(t);
  const route=routeName(t), heading=asCard?title(t):(entry(t).constellationName||route);
  const caption=asCard && heading!==route?route:departure(t);
  return '<button class="'+(asCard?'sky-card':'trip-row')+'" data-trip="'+safe(t.id)+'" type="button">'+
    '<span class="glyph">'+StarArt.glyph(s)+'</span><span class="row-copy"><strong>'+safe(heading)+'</strong><small>'+safe(caption)+' · '+(s.count?'별 '+s.count+'개':'경로 부족')+'</small></span>'+icon('go')+'</button>';
}
function empty(heading,copy,action) {return '<div class="empty"><div class="empty-mark">'+icon('stars')+'</div><h2>'+heading+'</h2><p>'+copy+'</p>'+(action||'')+'</div>';}
function info(t) {
  const s=shape(t), inAlbum=saved(t), route=routeName(t), heading=title(t);
  return '<section class="trip-info" data-detail-id="'+safe(t.id)+'"><div class="trip-date"><i></i>'+safe(departure(t))+(t.tag?.includes('모의')||t.demo?' <span>· 모의 주행</span>':'')+'</div>'+
    '<div class="drive-heading"><h2>'+safe(heading)+'</h2><button type="button" data-action="renameDrive" aria-label="주행 이름 변경" title="주행 이름 변경">'+icon('edit')+'</button></div>'+(route===heading?'':'<p class="route-label">'+icon('route')+safe(route)+'</p>')+
    '<dl class="trip-metrics"><div><dt>주행 거리</dt><dd>'+distance(t)+'</dd></div><div><dt>주행 시간</dt><dd>'+duration(t)+'</dd></div><div><dt>별</dt><dd>'+(s.count?s.count+'개':'—')+'</dd></div></dl>'+
    (s.count?'<div class="panel-actions">'+button(inAlbum?'폴더 변경':'보관함에 담기','edit','primary',inAlbum?'folder':'add')+button('별자리 공유','share','','share')+'</div>':
     '<p class="hint">별자리를 그릴 만큼 이어진 위치 기록이 없어요.</p>')+
    (s.partial?'<p class="hint">위치가 이어지는 구간만 표시해요.</p>':'')+
    (entry(t).note?'<p class="old-note">'+safe(entry(t).note)+'</p>':'')+
    (inAlbum?'<button class="text-btn remove" data-action="remove" type="button">보관함에서 빼기</button>':'')+'</section>';
}
function detail(){
  const t=selected();
  if(!t){go('log');return;}
  main.innerHTML='<div class="page-head"><h1>주행 상세</h1>'+button('돌아가기','back','','back')+'</div><div class="hero-grid">'+(shape(t).route.length?controls(false,!!shape(t).count):'<div class="map-missing">저장된 GPS 위치가 없습니다.</div>')+info(t)+'</div>';
  if(!journalReady){
    main.querySelectorAll('[data-action=renameDrive],[data-action=edit],[data-action=remove]').forEach(b=>b.disabled=true);
    main.querySelector('.trip-info').insertAdjacentHTML('beforeend','<p class="hint">저장한 이름과 폴더를 읽지 못했어요.</p>'+button('다시 읽기','reload'));
  }
  map([t]);
}
const skyResize=new ResizeObserver(([observation])=>{
  const field=observation.target;
  const {width,height}=observation.contentRect;
  if(!field.isConnected || !width || !height)return;
  const count=field.querySelectorAll('[data-course]').length;
  if(!count)return;
  const targetRows=Math.max(1,Math.round(Math.sqrt(count*height/width)));
  const cols=Math.min(Math.ceil(count/targetRows),Math.max(1,Math.floor(width/56)));
  field.style.setProperty('--cols',cols);
  field.style.setProperty('--rows',Math.ceil(count/cols));
});
const dust=StarArt.skyBackdrop();
function periodBar(range){
  const buttons=Object.entries(periods).map(([key,label])=>
    '<button type="button" data-sky-period="'+key+'" aria-pressed="'+(skyPeriod===key)+'">'+label+'</button>').join('');
  let dates='';
  if(range){
    const unit={week:'주',month:'달',year:'해'}[skyPeriod];
    dates='<div class="sky-dates"><button type="button" data-sky-step="-1" aria-label="이전 '+unit+'">'+icon('back')+'</button>'+
      '<span aria-live="polite">'+NightSky.periodLabel(skyPeriod,range)+'</span>'+
      '<button type="button" data-sky-step="1" aria-label="다음 '+unit+'"'+(skyOffset===0?' disabled':'')+'>'+icon('go')+'</button></div>';
  }
  return '<div class="sky-toolbar"><div class="sky-periods" role="group" aria-label="별자리 표시 기간">'+buttons+'</div>'+dates+'</div>';
}
function home(){
  const range=currentRange(), groups=skyCourses(range);
  renderedPeriodStart=range?.start.getTime() || 0;
  const figures=groups.map((g,i)=>
    '<button class="sky-object" type="button" data-course="'+safe(g.id)+'" aria-label="'+safe(groupTitle(g)+' 주행 보기')+'" style="--intensity:'+(.78+g.light*.22).toFixed(2)+';--glow:'+(2+g.light*6).toFixed(1)+'px">'+
    StarArt.skyGlyph(g,i)+'</button>').join('');
  const emptySky=groups.length?'':'<div class="sky-empty"><p>'+(range?'이 기간에 기록한 별자리가 없어요.':'주행을 마치면 이곳에 별자리가 생겨요.')+'</p>'+
    (range?'':button('주행 기록','log'))+'</div>';
  main.innerHTML='<section class="observatory" aria-label="내 별자리">'+dust+periodBar(range)+
    '<div class="sky-field"><div class="sky-plane"><div class="sky-patterns" data-count="'+groups.length+'">'+figures+'</div></div>'+emptySky+'</div></section>';
  if(groups.length>3)skyResize.observe(main.querySelector('.sky-field'));
}
function openCourse(id){
  const g=skyCourses().find(item=>item.id===id);
  if(!g)return;
  if(g.trips.length===1){open(g.trips[0].id,'home');return;}
  const several=g.variants.length>1;
  const visits=several?g.variants.map(v=>{
    const named=v.trips.map(t=>entry(t).constellationName).find(Boolean);
    const label=named || (v.order===0?'처음 달린 길':'경로 '+(v.order+1));
    return '<section class="visit-route"><h3><i aria-hidden="true" style="opacity:'+v.opacity.toFixed(3)+'"></i>'+safe(label)+' <small>'+v.trips.length+'회</small></h3>'+v.trips.map(t=>row(t)).join('')+'</section>';
  }).join(''):g.trips.map(t=>row(t)).join('');
  const preview=several?'<div class="course-preview">'+StarArt.skyGlyph(g,'preview',true)+'</div>':'';
  modal('<h2>'+safe(groupTitle(g))+'</h2><p>'+g.days+'일 동안 달린 길 · 주행 '+g.trips.length+'회</p>'+preview+'<div class="course-visits">'+visits+'</div><div class="actions">'+button('닫기','cancel')+'</div>');
}
function collection(){
  if(!journalReady){
    main.innerHTML=empty('보관함을 읽지 못했어요','저장한 이름과 폴더를 다시 불러올 수 있어요.',button('다시 읽기','reload','primary'));
    return;
  }
  const list=trips.filter(saved), names=folders();
  if(folderFilter!=='*' && !Object.hasOwn(names,folderFilter))folderFilter='*';
  const chips=[['*','전체'],...Object.entries(names)].map(([id,name])=>{
    const count=id==='*'?list.length:list.filter(t=>(entry(t).folder||'')===id).length;
    return '<button type="button" data-folder="'+safe(id)+'" aria-pressed="'+(folderFilter===id)+'">'+(id && id!=='*'?icon('folder'):'')+safe(name)+' <small>'+count+'</small></button>';
  }).join('');
  const shown=folderFilter==='*'?list:list.filter(t=>(entry(t).folder||'')===folderFilter);
  main.innerHTML='<div class="page-head"><h1>보관함 <small>'+list.length+'</small></h1>'+button('새 폴더','newFolder','','add')+'</div>'+
    (Object.keys(names).length?'<div class="folder-shelf" role="group" aria-label="폴더 선택">'+chips+'</div>':'')+
    '<div class="album-head">'+(folderFilter!=='*' && folderFilter?'<div class="folder-options">'+button('이름 변경','renameFolder','text-btn','edit')+button('폴더 삭제','deleteFolder','text-btn')+'</div>':'')+
    (shown.length?'<div class="view-switch">'+['list','atlas'].map((v,i)=>'<button type="button" data-collection="'+v+'" aria-pressed="'+(collectionView===v)+'">'+(i?'모아본 지도':'목록')+'</button>').join('')+'</div>':'')+'</div>';
  if(!shown.length){main.insertAdjacentHTML('beforeend',empty(folderFilter==='*'?'아직 담은 코스가 없어요':'이 폴더에 담은 코스가 없어요','주행 상세에서 기억하고 싶은 길을 담아 보세요.',button('주행 고르기','log','primary','route')));return;}
  main.insertAdjacentHTML('beforeend',(collectionView==='atlas'?controls(true):'')+'<div class="collection-grid">'+shown.map(t=>row(t,true)).join('')+'</div>');
  if(collectionView==='atlas')map(shown,true);
}
function recordingPrompt(){
  if(!bridge)return '';
  let action, label, message;
  if(!snapshot.autoEnabled){
    action='prepareRecording';label='자동 기록 시작';message='자동 기록이 꺼져 있어요.';
  }else if(!snapshot.recordingAccess){
    action='prepareRecording';label='기록 권한 허용';message='주행을 기록하려면 위치와 차량 정보 접근을 허용해 주세요.';
  }else if(!snapshot.monitoring){
    action='prepareRecording';label='다시 연결';message='자동 기록을 위해 차량에 연결해 주세요.';
  }else if(!snapshot.bootAccess){
    action='bootAccess';label='상시 위치 허용';message='차량을 다시 켠 뒤에도 자동 기록하려면 위치를 항상 허용해 주세요.';
  }else return '';
  return '<aside class="recording-prompt"><p>'+message+'</p><div class="actions">'+button(label,action,'primary')+
    ((!snapshot.recordingAccess || action==='bootAccess')?button('앱 권한 열기','permissions'):'')+'</div></aside>';
}
function log(){
  main.innerHTML='<div class="page-head"><h1>주행 기록 <small>'+trips.length+'</small></h1>'+(!bridge?button('모의 출발','simulate'):'')+'</div>'+recordingPrompt()+
    (trips.length?'<div class="log-list">'+trips.map(t=>row(t)).join('')+'</div>':empty('아직 기록된 주행이 없어요','출발 후 주차하면 이곳에 주행이 저장돼요.'));
}
function syncHeader(){
  for(const b of root.querySelectorAll('header [data-tab]')){
    b.setAttribute('aria-pressed',String(b.dataset.tab===(tab==='detail'?origin:tab)));b.disabled=locked();
  }
}
function render(){
  skyResize.disconnect();RoadlogMap.close();syncHeader();
  main.classList.toggle('sky-home',tab==='home' && !locked() && (!bridge || snapshot.historyRevision!==undefined));
  if(locked()){
    closeDialog();main.innerHTML=empty(snapshot.active?'주행을 기록하고 있어요':'주차 후 이용할 수 있어요','주차 후 이번 주행의 별자리를 확인하세요.');return;
  }
  if(bridge && snapshot.historyRevision===undefined){
    main.innerHTML=empty('주행 기록을 읽지 못했어요','기기의 저장 공간을 확인한 뒤 다시 시도해 주세요.',button('다시 읽기','reload','primary'));return;
  }
  if(tab==='home')home();else if(tab==='detail')detail();else if(tab==='collection')collection();else log();
}
function go(next){closeDialog();tab=next;mode='sky';window.scrollTo(0,0);render();}
function open(id,from){focused=id;origin=from;go('detail');}
function back(){
  if(dialog){closeDialog();return true;}
  if(tab==='detail'){go(origin);return true;}if(tab!=='home'){go('home');return true;}
  return false;
}
window.starRoadBack=back;
root.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  const act=b.dataset.action;
  if(locked())return;
  if(b.dataset.tab){go(b.dataset.tab);return;}
  if(b.dataset.skyPeriod || b.dataset.skyStep){
    if(b.dataset.skyPeriod){
      if(skyPeriod===b.dataset.skyPeriod)return;
      skyPeriod=b.dataset.skyPeriod;skyOffset=0;
    }else skyOffset=Math.min(0,skyOffset+Number(b.dataset.skyStep));
    render();
    const selector=b.dataset.skyPeriod?'[data-sky-period="'+skyPeriod+'"]':'[data-sky-step="'+b.dataset.skyStep+'"]:enabled';
    (main.querySelector(selector) || main.querySelector('[data-sky-step="-1"]'))?.focus({preventScroll:true});
    return;
  }
  if(b.hasAttribute('data-course')){openCourse(b.dataset.course);return;}
  if(b.hasAttribute('data-folder')){folderFilter=b.dataset.folder;render();return;}
  if(b.dataset.trip){open(b.dataset.trip,tab);return;}
  if(b.dataset.collection){collectionView=b.dataset.collection;render();return;}
  const t=selected();
  switch(act){
    case 'back':back();break;
    case 'newFolder':folderEditor();break;
    case 'renameFolder':folderEditor(folderFilter);break;
    case 'deleteFolder':folderEditor(folderFilter,true);break;
    case 'log':go(act);break;
    case 'reload':cachedRaw='';poll();break;
    case 'cancel':closeDialog();break;
    case 'edit':if(t && shape(t).count)editor(t);break;
    case 'renameDrive':if(t)nameEditor(t);break;
    case 'share':if(t && shape(t).count)share(t);break;
    case 'remove':if(t && persist(t,entry(t).constellationName||'',false)){render();tell('보관함에서 뺐어요.');}break;
    case 'prepareRecording':bridge?.prepareAutomaticRecording();break;
    case 'permissions':bridge?.openAppPermissions();break;
    case 'bootAccess':bridge?.requestBootAccess();break;
    case 'simulate':simulate();break;
    case 'parkDemo':parkDemo();break;
  }
});
function refreshCalendar(){
  if(!document.hidden && !dialog && tab==='home' && skyPeriod!=='all' && !locked() &&
      currentRange().start.getTime()!==renderedPeriodStart)render();
}
function poll() {
  if(document.hidden)return;
  try{
    const raw=bridge.getStatus();
    if(raw===cachedRaw){refreshCalendar();return;}
    const next=JSON.parse(raw);
    const refresh=next.historyRevision!==snapshot.historyRevision;
    const previousError=snapshot.error;
    if(refresh && !next.active && !next.restricted){
      const full=JSON.parse(bridge.getState());
      if(full && (full.restricted || full.active)){
        full.historyRevision=snapshot.historyRevision;
        snapshot=full;cachedRaw='';render();return;
      }
      if(!Array.isArray(full?.trips))throw Error('history');
      next.historyRevision=full.historyRevision;
      trips=full.trips;
      if(focused && !trips.some(t=>t.id===focused))focused=null;
      shapes.clear();courses=null;
    }else if(refresh){
      next.historyRevision=snapshot.historyRevision;
    }
    if(!journalReady && !next.active && !next.restricted){
      try{loadJournal();}catch(_){/* The archive and detail screens offer a retry. */}
    }
    cachedRaw=raw;snapshot=next;
    if(next.error && next.error!==previousError)tell(next.error);
    if(!dialog || locked())render();
  }catch(_){
    if(snapshot.historyRevision!==undefined)tell('차량 기록을 읽지 못했습니다.');
    else render();
  }
}
function simulate(){
  if(bridge)return;
  main.innerHTML=empty('모의 주행 중','강남역 골목을 한 바퀴 도는 예시 경로예요.',button('모의 주차','parkDemo','primary'));
}
function parkDemo(){
  const raw=JSON.parse(document.getElementById('rl-drive-course').textContent),start=Date.now()-155000;
  const points=raw.points.map(([lat,lon],i)=>({lat,lon,at:start+Math.round(i*155000/(raw.points.length-1))}));
  const t={id:'demo-'+Date.now(),title:raw.name,startedAt:start,date:new Date(start).toLocaleDateString('sv-SE').replaceAll('-','.'),km:.594,seconds:155,points,demo:true};
  const old=readLocal('starroad-sky/demo-drives',[]);
  try{localStorage.setItem('starroad-sky/demo-drives',JSON.stringify([t,...old]));}catch(_){tell('예시 경로를 저장할 수 없습니다.');return;}
  trips.unshift(t);courses=null;focused=t.id;go('home');
}
if(bridge){
  poll();setInterval(poll,1500);document.addEventListener('visibilitychange',poll);
}else{
  const examples=JSON.parse(document.getElementById('sr-examples').textContent).map(({path,...t})=>({...t,demo:true,points:path.map(([lat,lon])=>({lat,lon}))}));
  const legacy=readLocal('roadlog-demo-v1',{}).trips||[];
  trips=[...readLocal('starroad-sky/demo-drives',[]),...legacy.filter(t=>!t.id?.startsWith('sample-')),...examples];
  entries=readLocal('starroad-sky/entries',{});
  for(const t of trips){const old=readLocal('roadlog-journal-v1/demo/'+t.id,null);if(old&&!entries[t.id])entries[t.id]=old;}
  render();setInterval(refreshCalendar,60000);document.addEventListener('visibilitychange',refreshCalendar);
}
})();
