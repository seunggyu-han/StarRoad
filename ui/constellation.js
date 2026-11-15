// All thresholds are physical distances, independent of map zoom and display size.
const StarGeometry = (() => {
  'use strict';
  const metres = 111195;
  const samePlace = 35; // A parked vehicle may report two slightly different locations.
  const maxStars = 7;
  function same(a, b) {
    const lon = b[1] - a[1] - 360 * Math.round((b[1] - a[1]) / 360);
    return metres * Math.hypot(b[0] - a[0], lon * Math.cos((a[0] + b[0]) * Math.PI / 360)) <= samePlace;
  }
  function segments(points) {
    const lines = [];
    let line, time, lastLon;
    for (const p of points || []) {
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat)>90 || Math.abs(p.lon)>180) {
        line = null;
        time = null;
        continue;
      }
      if (!line || (Number.isFinite(time) && Number.isFinite(p.at) && (p.at-time>30000 || p.at<=time))) {
        line = [];
        lines.push(line);
      }
      const lon = lastLon == null ? p.lon : p.lon + 360 * Math.round((lastLon-p.lon)/360);
      if (!line.length || line.at(-1)[0] !== p.lat || line.at(-1)[1] !== lon) line.push([p.lat,lon]);
      time = p.at;
      lastLon = lon;
    }
    return lines;
  }
  function bounds(parts) {
    let south=Infinity,north=-Infinity,west=Infinity,east=-Infinity;
    for (const line of parts) for (const [lat,lon] of line) {
      south=Math.min(south,lat); north=Math.max(north,lat);
      west=Math.min(west,lon); east=Math.max(east,lon);
    }
    return {south,north,west,east};
  }
  function offLine(p, a, b) {
    const x=b[0]-a[0], y=b[1]-a[1];
    const frac=x || y ? Math.max(0, Math.min(1, ((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y))) : 0;
    return Math.hypot(p[0]-a[0]-frac*x,p[1]-a[1]-frac*y);
  }
  function intersection(a,b,c,d) {
    const x=b[0]-a[0], y=b[1]-a[1], u=d[0]-c[0], v=d[1]-c[1];
    const det=x*v-y*u;
    if(Math.abs(det)<=1e-10*Math.hypot(x,y)*Math.hypot(u,v))return null;
    const dx=c[0]-a[0], dy=c[1]-a[1];
    const t=(dx*v-dy*u)/det, s=(dx*y-dy*x)/det;
    if(Math.min(t,s)<-1e-9 || Math.max(t,s)>1+1e-9)return null;
    const snap=f=>f<1e-9?0:f>1-1e-9?1:f;
    return [snap(t),snap(s)];
  }
  // A bend crossed again in reverse has only two arms. Look past jitter at each visit.
  function branches(points,positions,center) {
    const rays=[];
    for(const pos of positions)for(const step of [-1,1]){
      let i=step<0?Math.ceil(pos)-1:Math.floor(pos)+1;
      for(;i>=0 && i<points.length;i+=step){
        const x=points[i][0]-center[0], y=points[i][1]-center[1], length=Math.hypot(x,y);
        if(length<8)continue;
        if(rays.every(([a,b])=>(x*a+y*b)/length<Math.cos(Math.PI/10)))rays.push([x/length,y/length]);
        break;
      }
    }
    return rays.length>=3;
  }
  function leavesJunction(points,positions,center,threshold){
    const end=Math.max(...positions);
    for(let i=Math.ceil(Math.min(...positions));i<end;i++){
      if(Math.hypot(points[i][0]-center[0],points[i][1]-center[1])>=threshold)return true;
    }
    return false;
  }
  function junctions(run, threshold) {
    const {line,projected:points,closed}=run, last=points.length-1;
    if(last<3 || run.length<2*threshold)return [];
    const {south:minX,north:maxX,west:minY,east:maxY}=bounds([points]);
    const axis=maxX-minX>=maxY-minY?0:1, other=1-axis;
    const offsets=[0], edges=[], found=new Map();
    for(let i=0;i<last;i++){
      const a=points[i],b=points[i+1];
      offsets.push(offsets[i]+Math.hypot(b[0]-a[0],b[1]-a[1]));
      edges.push({i,lo:Math.min(a[axis],b[axis]),hi:Math.max(a[axis],b[axis]),
        low:Math.min(a[other],b[other]),high:Math.max(a[other],b[other])});
    }
    edges.sort((a,b)=>a.lo-b.lo);
    for(let n=0;n<edges.length;n++){
      const a=edges[n], i=a.i;
      for(let k=n+1;k<edges.length && edges[k].lo<=a.hi;k++){
        const b=edges[k],j=b.i;
        if(Math.abs(i-j)<=1 || a.low>b.high || b.low>a.high)continue;
        const hit=intersection(points[i],points[i+1],points[j],points[j+1]);
        if(!hit)continue;
        const [t,s]=hit, positions=[i+t,j+s];
        if(closed && Math.min(...positions)===0 && Math.max(...positions)===last)continue;
        const along=(idx,f)=>offsets[idx]+f*(offsets[idx+1]-offsets[idx]);
        const span=Math.abs(along(i,t)-along(j,s));
        if(span<2*threshold)continue;
        const mix=(p,q,f)=>p.map((v,dim)=>v+(q[dim]-v)*f);
        const center=mix(points[i],points[i+1],t);
        if(!branches(points,positions,center) || !leavesJunction(points,positions,center,threshold))continue;
        const vertex=closed && positions.includes(last)?0:positions.find(Number.isInteger);
        const point=vertex===undefined?mix(line[i],line[i+1],t):line[vertex];
        const key=point.map(v=>v.toFixed(7)).join(',');
        const junction=found.get(key) || {run,point,visits:new Set(),span:0};
        for(const pos of positions)junction.visits.add(pos);
        junction.span=Math.max(junction.span,span);
        found.set(key,junction);
      }
    }
    return [...found.values()];
  }
  function anchorJunctions(runs,threshold,xy) {
    let count=runs.reduce((sum,r)=>sum+(r.closed?1:2),0);
    const crossings=runs.flatMap(run=>junctions(run,threshold)).sort((a,b)=>b.span-a.span);
    for(const {run,point,visits} of crossings){
      const endpoint=visits.has(0) || visits.has(run.line.length-1);
      if(!endpoint && count===maxStars)continue;
      const anchor=endpoint?(visits.has(0) || run.closed?run.line[0]:run.line.at(-1)):point;
      for(const pos of visits)run.anchors.set(pos,anchor);
      if(!endpoint)count++;
    }
    for(const run of runs){
      const line=run.line;
      if(!run.anchors.size){
        run.indices=[0,line.length-1];
        if(run.closed)run.projected[line.length-1]=run.projected[0];
        continue;
      }
      run.anchors.set(0,line[0]);
      run.anchors.set(line.length-1,run.closed?line[0]:line.at(-1));
      const insertions=[...run.anchors.keys()].filter(pos=>!Number.isInteger(pos));
      // Fractional positions are on observed GPS segments. The original track stays intact.
      const order=line.map((_,i)=>i).concat(insertions).sort((a,b)=>a-b);
      run.line=order.map(pos=>run.anchors.get(pos) || line[pos]);
      run.projected=run.line.map(xy);
      run.indices=order.flatMap((pos,i)=>run.anchors.has(pos)?[i]:[]);
    }
    return count;
  }
  function partOf(nodes,closed) {
    const stars=[...new Map(nodes.map(p=>[p.join(','),p])).values()];
    return {nodes,stars,closed};
  }
  function build(trip) {
    const route=segments(trip.points);
    const box=bounds(route), result={route,box,parts:[],count:0,partial:false,loop:false};
    if (!route.length || trip.km === 0 || box.south===box.north && box.west===box.east) return result;
    const eastScale=metres*Math.cos((box.south+box.north)*Math.PI/360);
    const xy=([lat,lon])=>[(lon-box.west)*eastScale,(lat-box.south)*metres];
    const threshold=Math.max(50, .04*Math.hypot((box.east-box.west)*eastScale,(box.north-box.south)*metres));
    let runs=route.map((line,order)=>{
      const projected=line.map(xy);
      let length=0;
      for(let i=1;i<line.length;i++) length+=Math.hypot(projected[i][0]-projected[i-1][0],projected[i][1]-projected[i-1][1]);
      const closed=line.length>2 && same(line[0],line.at(-1)) && projected.some(p=>offLine(p,projected[0],projected[0])>=50);
      return {line,projected,order,length,closed,anchors:new Map()};
    }).filter(run=>run.line.length>1 && run.length>0);
    if (runs.length>3) {
      runs=runs.sort((a,b)=>b.length-a.length || a.order-b.order).slice(0,3).sort((a,b)=>a.order-b.order);
      result.partial=true;
    }
    result.partial ||= route.length>1 || !!trip.interrupted;
    let count=anchorJunctions(runs,threshold,xy);
    while (count<maxStars) {
      let best=null;
      for (const run of runs) {
        for(let part=1;part<run.indices.length;part++) {
          const lo=run.indices[part-1], hi=run.indices[part];
          for(let i=lo+1;i<hi;i++) {
            const d=offLine(run.projected[i],run.projected[lo],run.projected[hi]);
            if (d>=threshold && (!best || d>best.d)) best={run,part,i,d};
          }
        }
      }
      if (!best) break;
      best.run.indices.splice(best.part,0,best.i);
      count++;
    }
    result.parts=runs.map(run=>partOf((run.closed?run.indices.slice(0,-1):run.indices).map(i=>run.line[i]),run.closed));
    result.count=result.parts.reduce((sum,part)=>sum+part.stars.length,0);
    result.loop=runs.length===1 && runs[0].closed;
    return result;
  }
  // Only the ends of saved journeys can join on the atlas. Internal bends remain per drive.
  function linkedParts(shapes) {
    const endpoints=[];
    return shapes.map(shape=>shape.parts.map(({nodes,closed})=>{
      const ends=new Map();
      for(const point of closed?[nodes[0]]:[nodes[0],nodes.at(-1)]){
        const existing=endpoints.find(p=>same(p,point));
        ends.set(point.join(','),existing || point);
        if(!existing)endpoints.push(point);
      }
      return partOf(nodes.map(point=>ends.get(point.join(',')) || point),closed);
    }));
  }
  function atlas(shapes) { return linkedParts(shapes).flat(); }
  return {segments,bounds,build,atlas,linkedParts};
})();
if (typeof module!=='undefined' && module.exports) module.exports=StarGeometry;
