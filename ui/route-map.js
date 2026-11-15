const RoadlogMap = (() => {
  'use strict';
  let current=null;
  const layers={};
  const colors={sea:'#121f33',land:'#253248',shore:'#4b6173',road:'#708096',trace:'#9ab9ca',gold:StarArt.gold};
  const credit='<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
  function data(id) { return layers[id] ||= JSON.parse(document.getElementById(id).textContent); }
  function close() {const previous=current;current=null;previous?.remove();}
  const spark='<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#ffe2aa" opacity=".11"/><path d="M16 3Q17.5 14 27 16Q17.5 17.5 16 29Q14 18 5 16Q14 14 16 3Z" fill="var(--gold)"/><circle cx="16" cy="16" r="2.6" fill="#fff8df"/></svg>';
  function show(node, shapes, {mode='sky',onMode=()=>{},onOpen=null,atlas=false}={}) {
    close();
    const entries=shapes.filter(e=>e.shape.route.length);
    if(!entries.length) {node.textContent='저장된 GPS 위치가 없습니다.';return;}
    const hasStars=entries.some(e=>e.shape.count);
    if(!hasStars)mode='road';
    const map=L.map(node,{preferCanvas:true,zoomControl:false,zoomSnap:.1,minZoom:2,maxZoom:20,scrollWheelZoom:false,attributionControl:true});
    current=map;
    map.attributionControl.setPrefix(false);
    const frame=node.closest('.map-frame');
    const skyLayer=L.layerGroup();
    let roadLayer=null;
    for(const [key,z] of [['geography',201],['roads',220],['roadNames',340],['tracks',405],['stars',450]]) map.createPane(key).style.zIndex=z;
    const geo=L.canvas({pane:'geography',padding:.12}),network=L.canvas({pane:'roads',padding:.12});
    const context=L.layerGroup(), jeju=L.layerGroup([],{attribution:credit});
    const seoul=L.layerGroup([],{attribution:credit}),local=L.layerGroup([],{attribution:credit});
    const places=L.layerGroup(), nameLayers=new Map();
    function path(line,opts,group,polygon=false) {(polygon?L.polygon:L.polyline)(line,{interactive:false,...opts}).addTo(group);}
    function label(p,name,group) {
      const el=document.createElement('span');el.textContent=name;
      L.marker(p,{pane:'roadNames',keyboard:false,interactive:false,icon:L.divIcon({className:'place-label',html:el,iconSize:[84,18],iconAnchor:[42,9]})}).addTo(group);
    }
    for(const ring of data('sr-land').rings) path(ring,{renderer:geo,stroke:true,color:colors.shore,weight:.8,fillColor:colors.land,fillOpacity:1,smoothFactor:.4},context,true);
    context.addTo(map);
    for(const [name,p] of [['서울',[37.555,126.975]],['부산',[35.116,129.04]],['대전',[36.352,127.386]],['대구',[35.866,128.594]],['제주',[33.494,126.532]]]) label(p,name,places);
    function base(id,group){
      const d=data(id);
      for(const [kind,coords] of d.features) {
        const area=['water','park','building','land'].includes(kind);
        const fill={water:'#1a3449',park:'#243d42',building:'#2a3748',land:colors.land};
        const main=kind==='major'||kind==='artery';
        path(coords,{renderer:network,stroke:!area,color:kind==='shore'?colors.shore:colors.road,
          opacity:kind==='shore'?.9:main?.53:.28,weight:kind==='shore'?1.4:main?1.45:.85,
          fillColor:fill[kind],fillOpacity:1,smoothFactor:.75},group,area);
      }
      const names=L.layerGroup();nameLayers.set(id,names);
      for(const [name,p] of d.labels || []) label(p,name,names);
    }
    const drawn=new Set();
    function use(group,visible){if(visible && !map.hasLayer(group))group.addTo(map);else if(!visible && map.hasLayer(group))map.removeLayer(group);}
    let online=null, tilesReady=false;
    function updateBase(){
      if(current!==map || !map._loaded)return;
      const zoom=map.getZoom(), viewport=map.getBounds();
      for(const [id,group,min] of [['rl-seoul-overview',seoul,9],['rl-offline-map',local,14],['sr-jeju',jeju,11]]){
        const visible=!tilesReady && zoom>=min && viewport.intersects(data(id).bounds);
        if(visible && !drawn.has(id)){base(id,group);drawn.add(id);}
        use(group,visible);
        if(nameLayers.has(id)){
          const labelsVisible=visible && (id==='rl-seoul-overview'?zoom>=10 && zoom<15:id==='rl-offline-map'?zoom>=16:zoom>=12);
          use(nameLayers.get(id),labelsVisible);
        }
      }
      use(places,zoom>=6 && zoom<10);
      use(context,!tilesReady);
    }
    const all=L.latLngBounds([]);
    const seen=new Set();
    function addStar(p) {
      const key=p.join(',');
      if(seen.has(key)) return;
      seen.add(key);
      L.marker(p,{pane:'stars',interactive:false,keyboard:false,icon:L.divIcon({className:'map-star',html:spark,iconSize:[28,28],iconAnchor:[14,14]})}).addTo(skyLayer);
    }
    const joined=atlas?StarGeometry.atlas(entries.map(e=>e.shape)):null;
    let partIndex=0;
    for(const {trip,shape} of entries) {
      const {south,west,north,east}=shape.box;
      all.extend([south,west]);all.extend([north,east]);
      for(const part of shape.parts){
        const {nodes,stars,closed}=joined?joined[partIndex++]:part;
        const line=closed?[...nodes,nodes[0]]:nodes;
        if(line.length>1){
          const poly=L.polyline(line,{color:colors.gold,weight:2.65,opacity:1,interactive:!!onOpen}).addTo(skyLayer);
          if(onOpen)poly.on('click',()=>onOpen(trip.id));
        }
        for(const p of stars)addStar(p);
      }
    }
    function buildRoadLayer(){
      const layer=L.layerGroup();
      for(const {shape} of entries)for(const line of shape.route){
        if(line.length===1)L.circleMarker(line[0],{radius:4,color:colors.trace,interactive:false}).addTo(layer);
        else path(line,{pane:'tracks',color:colors.trace,opacity:.92,weight:3.3},layer);
      }
      if(entries.length===1){
        const {route,loop}=entries[0].shape;
        const first=route[0][0],last=route.at(-1).at(-1);
        const pin=(p,txt,dir)=>L.circleMarker(p,{radius:4,color:'#dbedfa',fillColor:'#27455a',fillOpacity:1,interactive:false})
          .addTo(layer).bindTooltip(txt,{permanent:true,direction:dir,className:'map-pin'});
        pin(first,loop?'출발 · 도착':'출발','top');
        if(!loop && (first[0]!==last[0]||first[1]!==last[1]))pin(last,'도착','bottom');
      }
      return layer;
    }
    function apply(next,announce=true){
      if(!hasStars)next='road';
      mode=next;
      frame.dataset.mode=next;
      if(next==='sky'){
        disableTiles();
        frame.querySelector('.map-message').textContent='';
      }
      if(next==='road' && !roadLayer)roadLayer=buildRoadLayer();
      if(roadLayer)use(roadLayer,next==='road');
      use(skyLayer,next==='sky');updateBase();
      frame.querySelectorAll('[data-map-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapMode===mode)));
      const tiles=frame.querySelector('[data-map-online]');
      if(tiles){tiles.hidden=next==='sky';tiles.setAttribute('aria-pressed',String(!!online));}
      if(announce)onMode(next);
    }
    function fit(){
      const inset=Math.min(52,Math.max(23,node.clientWidth*.072),node.clientHeight*.16);
      map.fitBounds(all,{paddingTopLeft:[inset,inset+7],paddingBottomRight:[inset,inset+7],maxZoom:17,animate:false});
    }
    fit();apply(mode,false);
    const set=(selector,f)=>{const b=frame.querySelector(selector);if(b)b.onclick=f;};
    frame.querySelectorAll('[data-map-mode]').forEach(b=>b.onclick=()=>apply(b.dataset.mapMode));
    set('[data-map-fit]',fit);
    set('[data-map-in]',()=>map.zoomIn(1,{animate:false}));
    set('[data-map-out]',()=>map.zoomOut(1,{animate:false}));
    function disableTiles(){
      const previous=online;
      online=null;tilesReady=false;
      if(previous)map.removeLayer(previous);
    }
    set('[data-map-online]',()=>{
      const message=frame.querySelector('.map-message');
      message.textContent='';
      if(online)disableTiles();
      else {
        const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,maxNativeZoom:19,keepBuffer:0,attribution:credit});
        online=tiles;
        tiles.on('loading',()=>{
          if(online===tiles && current===map && tilesReady){tilesReady=false;updateBase();}
        });
        tiles.on('load',()=>{
          if(online===tiles && current===map){tilesReady=true;updateBase();}
        });
        tiles.on('tileerror',()=>queueMicrotask(()=>{
          if(online!==tiles || current!==map)return;
          disableTiles();apply(mode,false);
          message.textContent='온라인 지도를 불러오지 못해 오프라인 지도를 표시해요.';
        }));
        tiles.addTo(map);
      }
      apply(mode,false);
    });
    map.on('moveend',updateBase);
    let size=node.clientWidth+'x'+node.clientHeight;
    const observer=new ResizeObserver(()=>{
      const next=node.clientWidth+'x'+node.clientHeight;
      if(current===map && next!==size && node.clientWidth&&node.clientHeight){size=next;map.invalidateSize({pan:false});fit();}
    });
    observer.observe(node);
    map.once('unload',()=>{observer.disconnect();map.off('moveend',updateBase);});
  }
  return {show,close};
})();
