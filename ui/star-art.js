const StarArt = (() => {
  const gold=getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
  function project(shape,width,height,padding) {
    const {north,south,east,west}=shape.box;
    const cos=Math.cos((north+south)*Math.PI/360);
    const dx=(east-west)*cos,dy=north-south;
    const k=Math.min((width-padding*2)/(dx || 1e-8),(height-padding*2)/(dy || 1e-8));
    return ([lat,lon])=>[width/2+(lon-(east+west)/2)*cos*k,height/2+((north+south)/2-lat)*k];
  }
  function glyph(shape) {
    if(!shape.count)return '<span class="no-glyph" aria-hidden="true">—</span>';
    const xy=project(shape,140,82,12);
    const parts=shape.parts.map(({nodes,stars,closed})=>{
      const pts=nodes.map(xy),line=(closed?[...pts,pts[0]]:pts).map(p=>p.map(x=>x.toFixed(2)).join(',')).join(' ');
      return '<polyline fill="none" stroke="currentColor" stroke-width="1.6" points="'+line+'"/>'+stars.map(xy).map(([x,y])=>
        '<path transform="translate('+x.toFixed(2)+' '+y.toFixed(2)+')" d="M0 -4Q.6 -1 3.8 0Q.7 .8 0 4Q-.7 .8 -3.8 0Q-.8 -.8 0 -4Z" fill="currentColor"/>').join('');
    });
    return '<svg viewBox="0 0 140 82" aria-hidden="true">'+parts.join('')+'</svg>';
  }
  function skyGlyph(course,index,fit=false) {
    const {range,light,variants}=course;
    const span=fit?148:56+range*107, size=180;
    const halo='sky-halo-'+index;
    const origin=variants[0].shape.box.west;
    const align=([lat,lon])=>[lat,lon+360*Math.round((origin-lon)/360)];
    const parts=StarGeometry.linkedParts(variants.map(v=>v.shape));
    const bounds=StarGeometry.bounds(variants.map(({shape})=>{
      const {south,north,west,east}=shape.box;
      return [align([south,west]),align([north,east])];
    }));
    const xy=project({box:bounds},span,span,4);
    const place=p=>xy(align(p)).map(v=>+(v+(size-span)/2).toFixed(2));
    // Use one geographic scale. Paint the familiar road last so its shared sections stay bright.
    const layers=variants.map((v,i)=>({parts:parts[i],opacity:v.opacity})).sort((a,b)=>a.opacity-b.opacity);
    let art='';
    for(const layer of layers){
      art+='<g class="sky-route" opacity="'+layer.opacity.toFixed(3)+'">';
      for(const {nodes,stars,closed} of layer.parts) {
        const pts=nodes.map(place);
        const line=(closed?[...pts,pts[0]]:pts).map(p=>p.join(',')).join(' ');
        art+='<polyline fill="none" stroke="currentColor" stroke-width="'+(1.45+light)+'" stroke-linejoin="round" points="'+line+'"/>';
        for(const star of stars){
          const p=place(star);
          const r=(star===nodes[0] || (!closed && star===nodes.at(-1))?4.2:3.1)+light*1.4;
          art+='<g transform="translate('+p.join(' ')+')"><circle r="'+(r*(3.4+light))+'" fill="url(#'+halo+')"/>'+
            '<path transform="scale('+(r/5)+')" fill="currentColor" d="M0 -5.8Q.8 -.9 4.6 0Q.9 1.1 0 5.8Q-.8 1 -4.6 0Q-.9 -.9 0 -5.8Z"/><circle r="'+(1.25+light*.55)+'" fill="#fff9e5"/></g>';
        }
      }
      art+='</g>';
    }
    return '<svg class="sky-figure" viewBox="0 0 '+size+' '+size+'" aria-hidden="true" data-span="'+span.toFixed(1)+'" data-light="'+light.toFixed(2)+'"><defs><radialGradient id="'+halo+'"><stop stop-color="#ffdc94" stop-opacity="'+(.49+.24*light)+'"/><stop offset=".34" stop-color="#ffd18c" stop-opacity=".15"/><stop offset="1" stop-color="#e6aa6f" stop-opacity="0"/></radialGradient></defs>'+art+'</svg>';
  }
  function skyBackdrop() {
    const width=1260,height=840;
    let seed=317;
    function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
    // Spread a little more starlight along the diagonal band of the sky.
    let dust='';
    for(let i=0;i<780;i++){
      const x=rand()*width;
      const y=i<335?height*(.83-.64*x/width)+(rand()+rand()+rand()-1.5)*221:rand()*height;
      const radius=.38+rand()**3*1.16, alpha=.20+rand()*.58;
      dust+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+radius.toFixed(2)+'" opacity="'+alpha.toFixed(2)+'"/>';
    }
    return '<svg class="sky-dust" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#d6e4fa">'+dust+'</g></svg>';
  }
  const wordmark=new Path2D(document.querySelector('#brand-wordmark path').getAttribute('d'));
  function poster(trip,shape,title,subtitle) {
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;
    const c=canvas.getContext('2d');
    const wash=c.createLinearGradient(0,0,1080,1080);wash.addColorStop(0,'#1d2c42');wash.addColorStop(1,'#0d1422');
    c.fillStyle=wash;c.fillRect(0,0,1080,1080);
    c.save();c.translate(70,61);c.scale(.43,.43);c.fillStyle=gold;c.fill(wordmark);c.restore();
    const fonts=getComputedStyle(document.body).fontFamily;
    c.fillStyle='#adc0cd';c.font='28px '+fonts;c.textAlign='right';c.fillText(trip.date || '',1010,92);c.textAlign='left';
    c.save();c.translate(70,150);
    const xy=project(shape,940,664,42);
    c.strokeStyle=gold;c.lineWidth=4;c.lineJoin='round';c.lineCap='round';
    for(const part of shape.parts){
      c.beginPath();
      part.nodes.forEach((p,i)=>{const [x,y]=xy(p);if(i)c.lineTo(x,y);else c.moveTo(x,y);});
      if(part.closed)c.closePath();
      c.stroke();
      for(const p of part.stars){
        const [x,y]=xy(p);c.fillStyle='#ffda9030';c.beginPath();c.arc(x,y,15,0,2*Math.PI);c.fill();
        c.fillStyle=gold;c.beginPath();c.moveTo(x,y-11);c.quadraticCurveTo(x+1.5,y-2,x+10,y);
        c.quadraticCurveTo(x+2,y+1.5,x,y+11);c.quadraticCurveTo(x-2,y+1.5,x-10,y);
        c.quadraticCurveTo(x-1.5,y-2,x,y-11);c.fill();
      }
    }
    c.restore();
    function line(text,y,initial,min,color) {
      let size=initial;c.font='600 '+size+'px '+fonts;
      while(c.measureText(text).width>940 && size>min)c.font='600 '+(--size)+'px '+fonts;
      if(c.measureText(text).width>940){
        const chars=Array.from(text);while(chars.length && c.measureText(chars.join('')+'…').width>940)chars.pop();
        text=chars.join('')+'…';
      }
      c.fillStyle=color;c.fillText(text,70,y);
    }
    line(title,subtitle?923:978,64,28,'#fff2da');
    if(subtitle)line(subtitle,993,37,24,'#ccdae4');
    return canvas;
  }
  return {gold,glyph,skyGlyph,skyBackdrop,poster};
})();
