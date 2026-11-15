const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../ui/constellation.js');
const trip=(points,extra={})=>({points:points.map(([lat,lon,at])=>({lat,lon,at})),...extra});
test('a straight drive has two end stars, irrespective of distance or extra fixes',()=>{
  for(const length of [.001,2])assert.equal(G.build(trip([[0,0],[0,length/2],[0,length]])).count,2);
});
test('stationary, missing and invalid locations do not generate a collectible',()=>{
  for(const t of [trip([]),trip([[1,1],[1,1]]),trip([[1,1],[1.00003,1]],{km:0}),trip([[NaN,2],[2,2]])])assert.equal(G.build(t).count,0);
});
test('50 metre floor discards small deviations but larger bends get a star',()=>{
  assert.equal(G.build(trip([[35,125],[35.0003,125.003],[35,125.006]])).count,2);
  assert.equal(G.build(trip([[35,125],[35.0007,125.003],[35,125.006]])).count,3);
});
test('a return within parking accuracy closes the loop with a single origin star',()=>{
  const g=G.build(trip([[37,127],[37.006,127],[37.006,127.005],[37,127.005],[37.00005,127]]));
  assert.ok(g.loop);assert.equal(g.count,4);assert.equal(g.parts[0].nodes.length,4);
});
test('gaps never connect even in the atlas, and disconnected fixes alone produce no shape',()=>{
  const gap=G.build(trip([[35,126,1000],[35.01,126,2000],[36,127,60000],[36,127.01,61000]]));
  assert.equal(gap.parts.length,2);assert.ok(gap.partial);assert.equal(G.atlas([gap]).length,2);
  assert.equal(G.build(trip([[35,126,1000],[36,127,61000]])).count,0);
});
test('multiple gaps respect the course budget and retain the longest observed sections',()=>{
 const pts=[];for(let i=0;i<8;i++)pts.push([35+i*.01,127,1000+i*40000],[35+i*.01,127+(i+1)*.001,2000+i*40000]);
 const g=G.build(trip(pts));assert.ok(g.count<=7);assert.equal(g.parts.length,3);assert.equal(g.route.length,8);assert.ok(g.partial);
});
test('next drive can reuse a nearby endpoint without inventing a line between unrelated places',()=>{
 const a=G.build(trip([[37,127],[37.01,127]])),b=G.build(trip([[37.0101,127],[37.01,127.02]])),c=G.build(trip([[35,128],[35.01,128]]));
 const grouped=G.atlas([a,b,c]);assert.equal(grouped.length,3);assert.equal(grouped[0].nodes[1],grouped[1].nodes[0]);assert.notEqual(grouped[2].nodes[0],grouped[1].nodes[1]);
});
test('unwrapping longitudes keeps dateline roads local',()=>{
 const g=G.build(trip([[20,179.99],[20.01,-179.999],[20,-179.99]]));assert.ok(g.box.east-g.box.west<.03);assert.equal(g.count,3);
});
const N=require('../ui/night-sky.js');
test('Seoul to Busan and its return paint only their star lines in the sky and the visit preview',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const code=fs.readFileSync(require.resolve('../ui/star-art.js'),'utf8');
  const art=vm.runInNewContext(code+'\nStarArt',{
    StarGeometry:G, Path2D:class {}, document:{documentElement:{},querySelector:()=>({getAttribute:()=>''})},
    getComputedStyle:()=>({getPropertyValue:()=>'#ffdb91'})
  });
  const drives=require('../ui/preview-drives.json').filter(t=>['preview-seoul','preview-busan-return'].includes(t.id))
    .map(({path,...record})=>({...record,...trip(path)}));
  const [group]=N.view(N.groups(drives,G.build));
  assert.equal(group.variants.length,2);
  const expected=group.variants.flatMap(v=>v.shape.parts.map(p=>p.nodes.length+(p.closed?1:0))).sort((a,b)=>a-b);
  for(const preview of [false,true]){
    const svg=art.skyGlyph(group,'seoul-test',preview);
    const drawn=[...svg.matchAll(/<polyline\b[^>]*\bpoints="([^"]*)"/g)].map(m=>m[1].trim().split(/\s+/).length);
    assert.deepEqual(drawn.sort((a,b)=>a-b),expected);
  }
});
test('preview drives group the weekday commute, both intercity routes, and the distinct city loops',()=>{
  const drives=require('../ui/preview-drives.json').map(({path,...record})=>({...record,...trip(path)}));
  const shapes=new Map(drives.map(d=>[d.id,G.build(d)]));
  const groups=N.groups(drives,d=>shapes.get(d.id));
  assert.equal(new Set(drives.map(d=>d.id)).size,drives.length);
  assert.ok([...shapes.values()].every(s=>s.count>=2 && s.count<=7 && !s.partial));
  const commute=groups.find(g=>g.trip.title==='한양대학교 → 현대자동차 본사');
  assert.equal(commute.variants.length,1);
  assert.deepEqual(commute.trips.map(t=>N.day(t).getDay()).sort(),[1,2,3,4,5]);
  assert.equal(groups.find(g=>g.trip.id==='preview-seoul').variants.length,2);
  assert.ok(shapes.get('preview-yeouido').loop);
  const city=shapes.get('preview-gangnam');
  assert.equal(city.loop,false);
  const road=city.route[0].map(p=>p.join(','));
  assert.ok(road.some((p,i)=>i>0 && road.lastIndexOf(p)>i+2 && road.lastIndexOf(p)<road.length-1));
  const junction=[37.500615,127.027263].join(',');
  const {nodes,stars}=city.parts[0];
  assert.equal(nodes.filter(p=>p.join(',')===junction).length,2);
  assert.equal(stars.filter(p=>p.join(',')===junction).length,1);
  assert.equal(city.count,6);
});
test('a crossing between fixes anchors both passes at one star without changing the GPS track',()=>{
  const line=[[-.003,-.003],[.003,.003],[.003,-.003],[-.003,.003]];
  const g=G.build(trip(line));
  const atCross=p=>Math.hypot(p[0],p[1])<1e-9;
  assert.deepEqual(g.route,[line]);
  assert.equal(g.parts[0].nodes.filter(atCross).length,2);
  assert.equal(g.parts[0].stars.filter(atCross).length,1);
  assert.equal(g.count,5);
  assert.equal(g.loop,false);
  const separated=G.build(trip(line.map((p,i)=>[...p,[0,1000,60000,61000][i]])));
  assert.equal(separated.count,4);
  assert.ok(separated.parts.every(part=>!part.stars.some(atCross)));
});
test('a retraced bend creates no junction, and dense crossings stay within the seven-star budget',()=>{
  const bend=[[0,0],[0,.004],[.004,.004]];
  const back=G.build(trip([...bend,...bend.slice(0,-1).reverse()]));
  assert.equal(back.count,3);
  const many=Array.from({length:12},(_,n)=>{
    const theta=(n*5%12)*Math.PI/6;return [0.01*Math.sin(theta),0.01*Math.cos(theta)];
  });
  const complex=G.build(trip(many)).parts[0];
  assert.ok(complex.nodes.length>complex.stars.length);
  assert.ok(complex.stars.length<=7);
  assert.deepEqual(complex.stars.map(String),[...new Set(complex.nodes.map(String))]);
});

const course=(id,date,line,km=10)=>({...trip(line),id,date,km});
const commute=[[37.5,127.0],[37.51,127.01],[37.515,127.027],[37.52,127.032]];
test('calendar periods use Monday through Sunday and cross year and leap-month boundaries',()=>{
  const sunday=new Date(2027,0,3,23,59);
  const week=N.periodRange('week',0,sunday);
  assert.deepEqual(week,{start:new Date(2026,11,28),end:new Date(2027,0,4)});
  assert.equal(N.periodLabel('week',week),'2026년 12월 28일 – 2027년 1월 3일');
  assert.deepEqual(N.periodRange('month',-1,new Date(2024,2,31)),{start:new Date(2024,1,1),end:new Date(2024,2,1)});
  assert.deepEqual(N.periodRange('year',-1,sunday),{start:new Date(2026,0,1),end:new Date(2027,0,1)});
  assert.equal(N.periodRange('all',0,sunday),null);
});
test('the sky counts only visits and variants in the selected period while retaining the course identity',()=>{
  const route=[[0,0],[0,.02]], detour=[[0,0],[.008,.01],[0,.02]];
  const original=course('origin','2026.10.30',route);
  const nov1=course('prior','2026.11.08',route);
  const tue=course('detour','2026.11.10',detour);
  const sun=course('return','2026.11.15',detour.toReversed());
  const next=course('next','2026.11.16',route);
  const undated=course('unknown','',route.map(([lat,lon])=>[lat+.1,lon]));
  const groups=N.groups([undated,next,sun,tue,nov1,original],G.build);
  const period=(unit,offset=0)=>N.periodRange(unit,offset,new Date(2026,10,15));
  const [current]=N.view(groups,period('week'));
  assert.equal(current.id,original.id);
  assert.deepEqual(current.trips.map(t=>t.id),['return','detour']);
  assert.equal(current.days,2);
  assert.deepEqual(current.variants.map(v=>v.id),['detour']);
  assert.equal(current.variants[0].order,1);
  const [previous]=N.view(groups,period('week',-1));
  assert.deepEqual(previous.trips.map(t=>t.id),['prior']);
  assert.ok(previous.light<current.light);
  assert.equal(N.view(groups,period('month'))[0].trips.length,4);
  assert.equal(N.view(groups,period('year'))[0].trips.length,5);
  assert.deepEqual(N.view(groups,period('year',-1)),[]);
  assert.equal(N.view(groups).length,2);
});
test('a single sky includes every course across dates and more than six distinct roads',()=>{
  const rows=Array.from({length:12},(_,i)=>course('trip-'+i,'2026.'+String(i+1).padStart(2,'0')+'.04',
    commute.map(([lat,lon])=>[lat+i*.1,lon])));
  const sky=N.view(N.groups(rows,G.build));
  assert.deepEqual(new Set(sky.map(g=>g.trip.id)),new Set(rows.map(t=>t.id)));
  assert.equal(N.day({date:'2026.02.30'}),null);
});
test('one constellation keeps its original road, its return and the new branch in the same place',()=>{
  const a=course('a','2026.01.10',commute),b=course('b','2026.04.10',commute.toReversed()),other=course('c','2026.04.11',[commute[0],[37.49,127.037],commute.at(-1)]);
  const grouped=N.groups([other,b,a],G.build);
  assert.equal(grouped.length,1);
  const sky=N.view(grouped)[0];
  assert.equal(sky.id,'a');assert.equal(sky.days,3);assert.equal(sky.trip.id,'a');
  assert.deepEqual(sky.trips.map(t=>t.id),['c','b','a']);
  assert.deepEqual(sky.variants.map(v=>v.trips.map(t=>t.id)),[['b','a'],['c']]);
  assert.ok(sky.variants[0].opacity>sky.variants[1].opacity);
});
test('a short side road on a long trip is a distinct variant in either order',()=>{
  const straight=[[37,127],[37,128]];
  const detour=[straight[0],[37,127.143],[37.0014,127.144],[37.0014,127.15],[37,127.151],straight[1]];
  const a=course('straight','2026.01.10',straight,89);
  const b=course('detour','2026.02.10',detour,89.2);
  for(const trips of [[b,a],[a,b]]){
    const groups=N.groups(trips,G.build);
    assert.equal(groups.length,1);
    assert.equal(groups[0].variants.length,2);
  }
});
test('the same road with uneven GPS samples, small lateral errors and a return keeps each visit',()=>{
  const road=[[37,127],[37,127.005],[37.009,127.005]];
  const back=[[37.00901,127.00503],[37.004,127.00506],[37.00004,127.005],[37.00002,127.001],[37.00003,127]];
  const a=course('first','2026.03.05',road,1.44), b=course('later','2026.03.05',back,1.43);
  const sky=N.view(N.groups([b,a],G.build));
  assert.equal(sky.length,1);assert.equal(sky[0].days,1);
  assert.equal(sky[0].variants.length,1);
  assert.deepEqual(sky[0].trips.map(t=>t.id),['later','first']);
});
test('both endpoints must match, and different closed loops from the same parking place share one sky object',()=>{
  const [a,b,c,d]=commute;
  const roads=[course('loop-a','2026.03.02',[a,b,c,a]),course('loop-b','2026.03.01',[a,d,c,a]),
    course('one-end','2026.03.01',[a,c]),course('other-end','2026.03.01',[b,c])];
  const groups=N.groups(roads,G.build);
  assert.equal(groups.length,3);
  assert.equal(groups.find(g=>g.id==='loop-b').variants.length,2);
  assert.ok(groups.every(g=>g.trips.length===1 || g.trips.every(t=>t.id.startsWith('loop'))));
});
test('a detour can become the brighter road without replacing the initial constellation',()=>{
  const main=course('main','2026.03.05',commute);
  const alt=course('side','2026.03.05',[commute[0],[37.5,127.03],commute.at(-1)]);
  const sky=trips=>N.view(N.groups(trips,G.build))[0];
  const tie=sky([alt,main]);
  assert.ok(tie.variants[0].opacity>tie.variants[1].opacity);
  const busy=sky([{...alt,id:'again'},alt,main]);
  assert.equal(busy.id,main.id);
  assert.deepEqual(busy.variants.map(r=>r.id),[main.id,alt.id]);
  assert.ok(busy.variants[1].opacity>busy.variants[0].opacity);
  assert.equal(busy.days,1);
});
test('brightness depends on distinct matching driving days and distance governs span independently',()=>{
 const a=course('a','2026.11.02',commute), b=course('b','2026.11.02',commute), c=course('c','2026.11.03',commute);
 const alone=N.view(N.groups([a],G.build))[0],sameDay=N.view(N.groups([b,a],G.build))[0],more=N.view(N.groups([c,b,a],G.build))[0];
 assert.equal(sameDay.light,alone.light);assert.ok(more.light>alone.light);assert.equal(more.range,alone.range);
 assert.ok(N.view(N.groups([{...a,km:300}],G.build))[0].range>alone.range);
 assert.equal(N.groups([a,{...a,id:'gap',interrupted:true}],G.build).length,2);
});
test('automatic titles use actual places or recorded time and preserve existing descriptive route titles',()=>{
 const name=id=>N.title(require('../ui/preview-drives.json').find(t=>t.id===id));
 assert.equal(name('preview-commute-09'),'한양대에서 현대차 본사 가는 길');
 assert.equal(name('preview-seoul'),'서울에서 부산 가는 길');
 assert.equal(name('preview-busan-return'),'부산에서 서울 가는 길');
 assert.equal(name('preview-jeju'),'월정리에서 세화 가는 길');
 assert.equal(name('preview-yeouido'),'여의도공원 순환길');
 assert.equal(name('preview-gangnam'),'강남대로98길');
 assert.equal(N.title({title:'강남역 골목 한 바퀴'}),'강남역 골목 한 바퀴');
 assert.equal(N.title({title:'나의 드라이브',date:'2026.11.14'}),'11월 14일에 달린 길');
 assert.equal(N.title({startedAt:new Date(2026,10,14,7,5).getTime()}),'11월 14일 07:05에 달린 길');
 assert.equal(N.title({title:'서울역 → 대전역 → 부산역'}),'서울에서 부산 가는 길');
 assert.equal(N.title({to:'경복궁'}),'경복궁 가는 길');
 assert.equal(N.title({from:'경복궁'}),'경복궁에서 출발한 길');
 assert.equal(N.title({}),'기록한 길');
});
