const NightSky = (() => {
  'use strict';
  function day(t) {
    const match=/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/.exec(t.date || '');
    if(match){
      const [year,month,date]=match.slice(1).map(Number);
      const d=new Date(year,month-1,date,12);
      if(d.getFullYear()===year && d.getMonth()===month-1 && d.getDate()===date)return d;
    }
    if(!(t.startedAt>0))return null;
    const d=new Date(t.startedAt);
    if(!Number.isFinite(d.getTime()))return null;
    d.setHours(12,0,0,0);
    return d;
  }
  // Half-open local calendar ranges also cover weeks that span two months or years.
  function periodRange(unit,offset=0,today=new Date()){
    if(unit==='all')return null;
    const y=today.getFullYear(),m=today.getMonth(),d=today.getDate();
    if(unit==='week'){
      const monday=d-(today.getDay()+6)%7+7*offset;
      return {start:new Date(y,m,monday),end:new Date(y,m,monday+7)};
    }
    if(unit==='month')return {start:new Date(y,m+offset,1),end:new Date(y,m+offset+1,1)};
    return {start:new Date(y+offset,0,1),end:new Date(y+offset+1,0,1)};
  }
  function periodLabel(unit,range){
    const first=range.start, last=new Date(range.end.getTime()-1);
    const year=first.getFullYear()+'년', month=(first.getMonth()+1)+'월';
    if(unit==='year')return year;
    if(unit==='month')return year+' '+month;
    const until=(first.getFullYear()!==last.getFullYear()?last.getFullYear()+'년 ':'')+
      (first.getMonth()!==last.getMonth()?(last.getMonth()+1)+'월 ':'')+last.getDate()+'일';
    return year+' '+month+' '+first.getDate()+'일 – '+until;
  }
  function places(t) {
    const stops=typeof t.title==='string' ? t.title.split('→').map(s=>s.trim()).filter(Boolean) : [];
    if(stops.length>1)return stops;
    return [t.from,t.to].map(s=>typeof s==='string'?s.trim():'');
  }
  function title(t) {
    const stops=places(t);
    const short=s=>s.replace(/\s+앞$/,'').replace(/대학교/g,'대').replace(/자동차(?= 본사)/g,'차');
    let from=short(stops[0]),to=short(stops.at(-1));
    if(from && from===to)return to+(t.km===0?' 정차 기록':' 순환길');
    if(to.endsWith('길'))return to;
    if(from && to){
      const suffix=from.endsWith('역') && to.endsWith('역') ? /역$/ :
        /(?:해변|해수욕장)$/.test(from) && /(?:해변|해수욕장)$/.test(to) ? /(?:해변|해수욕장)$/ : null;
      if(suffix){from=from.replace(suffix,'')||from;to=to.replace(suffix,'')||to;}
      return from+'에서 '+to+' 가는 길';
    }
    if(to)return to+' 가는 길';
    if(from)return from+'에서 출발한 길';
    if(typeof t.title==='string' && t.title.trim() && !['나의 드라이브','새로운 드라이브','중단된 주행 기록'].includes(t.title))return t.title.trim();
    const d=day(t);
    if(!d)return '기록한 길';
    const start=new Date(t.startedAt);
    const clock=t.startedAt>0 && Number.isFinite(start.getTime()) ? ' '+[start.getHours(),start.getMinutes()].map(n=>String(n).padStart(2,'0')).join(':') : '';
    return (d.getMonth()+1)+'월 '+d.getDate()+'일'+clock+'에 달린 길';
  }
  const radians=Math.PI/180;
  const wrap=d=>d-360*Math.round(d/360);
  function metres(a,b) {
    return 111195*Math.hypot(b[0]-a[0],wrap(b[1]-a[1])*Math.cos((a[0]+b[0])*radians/2));
  }
  function signature(shape) {
    if(shape.partial || shape.route.length!==1 || !shape.count)return null;
    const line=shape.route[0], offsets=[0];
    for(let i=1;i<line.length;i++)offsets.push(offsets[i-1]+metres(line[i-1],line[i]));
    return {line,offsets,length:offsets.at(-1)};
  }

  // Keep every GPS vertex and insert probes on long straight segments. Use a
  // monotone distance window so crossing the same junction in a different order
  // cannot hide a detour.
  function follows(source,target){
    const tolerance=35;
    const slack=Math.max(100,Math.min(1200,target.length*.012));
    const threshold=tolerance*tolerance;
    let first=0;
    for(let i=1;i<source.line.length;i++){
      const a=source.line[i-1],b=source.line[i];
      const segment=source.offsets[i]-source.offsets[i-1];
      const steps=Math.max(1,Math.ceil(segment/70));
      for(let j=1;j<=steps;j++){
        const fraction=j/steps;
        const lat=a[0]+(b[0]-a[0])*fraction;
        const lon=a[1]+wrap(b[1]-a[1])*fraction;
        const expected=(source.offsets[i-1]+segment*fraction)*target.length/source.length;
        const low=expected-slack,high=expected+slack;
        while(first<target.line.length-2 && target.offsets[first+1]<low)first++;
        const lonScale=111195*Math.cos(lat*radians);
        let near=false;
        for(let k=first;k<target.line.length-1 && target.offsets[k]<=high;k++){
          const p=target.line[k],q=target.line[k+1];
          const x=wrap(p[1]-lon)*lonScale,y=(p[0]-lat)*111195;
          const dx=wrap(q[1]-p[1])*lonScale,dy=(q[0]-p[0])*111195;
          const extent=dx*dx+dy*dy;
          const f=extent?Math.max(0,Math.min(1,-(x*dx+y*dy)/extent)):0;
          const along=target.offsets[k]+f*(target.offsets[k+1]-target.offsets[k]);
          if(along>=low && along<=high && (x+dx*f)**2+(y+dy*f)**2<=threshold){
            near=true;break;
          }
        }
        if(!near)return false;
      }
    }
    return true;
  }
  function sameEnds(a,b){
    return metres(a[0],b[0])<=35 && metres(a.at(-1),b.at(-1))<=35;
  }
  function reversedEnds(a,b){
    return metres(a[0],b.at(-1))<=35 && metres(a.at(-1),b[0])<=35;
  }
  function matches(source,target){
    if(!source || !target)return false;
    const shorter=Math.min(source.length,target.length);
    if(!shorter || Math.abs(source.length-target.length)>Math.max(90,shorter*.12))return false;
    if(sameEnds(source.line,target.line) && follows(source,target) && follows(target,source))return true;
    if(!reversedEnds(source.line,target.line))return false;
    const reverse={line:target.line.slice().reverse(),offsets:target.offsets.map(d=>target.length-d).reverse(),length:target.length};
    return follows(source,reverse) && follows(reverse,source);
  }
  function groups(trips, shapeOf){
    const groups=[];
    // The first recorded drive fixes the endpoints, the initial outline and its position in the sky.
    for(const trip of trips.slice().reverse()){
      const shape=shapeOf(trip);
      if(!shape.count)continue;
      const track=signature(shape);
      let group=track && groups.find(g=>g.track && (sameEnds(g.track.line,track.line) || reversedEnds(g.track.line,track.line)));
      if(!group){
        group={id:trip.id,trip,track,trips:[],variants:[]};
        groups.push(group);
      }
      let variant=group.variants.find(v=>matches(v.track,track));
      if(!variant){
        variant={id:trip.id,order:group.variants.length,shape,track,trips:[]};
        group.variants.push(variant);
      }
      variant.trips.push(trip);
      group.trips.push(trip);
    }
    for(const group of groups){
      group.trips.reverse();
      for(const variant of group.variants)variant.trips.reverse();
    }
    return groups;
  }
  function view(groups,period=null){
    const out=[];
    for(const group of groups){
      const {id,trip}=group;
      const trips=period?group.trips.filter(t=>{
        const date=day(t);
        return date && date>=period.start && date<period.end;
      }):group.trips;
      if(!trips.length)continue;
      const included=period?new Set(trips):null;
      const variants=included?group.variants.map(v=>({...v,trips:v.trips.filter(t=>included.has(t))})).filter(v=>v.trips.length):group.variants;
      const days=new Set(trips.map(t=>day(t)?.getTime()).filter(Number.isFinite));
      const count=days.size || 1;
      const distance=Math.max(0,Number(trips.at(-1).km)||0);
      // Keep the original discernible on ties. One more actual visit always outweighs the tie break.
      const weights=variants.map(v=>v.trips.length+(v.order===0?.5:0));
      const peak=weights.reduce((max,n)=>Math.max(max,n),1);
      const layers=variants.map(({id,order,shape,trips},i)=>({
        id,order,shape,trips,opacity:.32+.68*Math.pow(weights[i]/peak,1.5)
      }));
      out.push({id,trip,trips,variants:layers,days:count,range:Math.min(1,Math.log1p(distance)/Math.log(501)),
        light:Math.min(1,Math.log2(count)/3)});
    }
    return out.sort((a,b)=>b.range-a.range || (day(b.trip)?.getTime()||0)-(day(a.trip)?.getTime()||0) || String(a.id).localeCompare(String(b.id)));
  }
  return {day,periodRange,periodLabel,places,title,groups,view};
})();
if(typeof module!=='undefined' && module.exports)module.exports=NightSky;
