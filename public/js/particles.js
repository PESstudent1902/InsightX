/* particles.js — animated flight-path particle system */
(function(){
  const canvas = document.getElementById('particles');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, planes=[], trails=[];

  function resize(){
    W=canvas.width=window.innerWidth;
    H=canvas.height=window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // World cities approximate screen positions (normalised 0-1)
  const nodes=[
    {x:.12,y:.45},{x:.22,y:.35},{x:.35,y:.38},{x:.45,y:.42},
    {x:.55,y:.48},{x:.60,y:.55},{x:.70,y:.40},{x:.78,y:.45},
    {x:.50,y:.30},{x:.40,y:.60},{x:.65,y:.30},{x:.82,y:.60},
    {x:.18,y:.55},{x:.30,y:.50},{x:.88,y:.35},{x:.92,y:.55},
  ];

  function rNode(){ return nodes[Math.floor(Math.random()*nodes.length)]; }

  function createPlane(){
    const a=rNode(), b=rNode();
    return{
      ax:a.x*W, ay:a.y*H,
      bx:b.x*W, by:b.y*H,
      t:0, speed: .0006+Math.random()*.0008,
      size: 1.5+Math.random()*1.5,
      alpha: .5+Math.random()*.5,
      trail:[]
    };
  }

  for(let i=0;i<18;i++){
    const p=createPlane();
    p.t=Math.random();
    planes.push(p);
  }

  // Static background routes
  const routes=[];
  for(let i=0;i<20;i++){
    const a=rNode(),b=rNode();
    routes.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,alpha:Math.random()*.06+.02});
  }

  function bezierPt(ax,ay,bx,by,t){
    // simple quadratic with midpoint control
    const cx=(ax+bx)/2+(by-ay)*.25, cy=(ay+by)/2-(bx-ax)*.1;
    const x=(1-t)*(1-t)*ax+2*(1-t)*t*cx+t*t*bx;
    const y=(1-t)*(1-t)*ay+2*(1-t)*t*cy+t*t*by;
    return{x,y};
  }

  function draw(){
    ctx.clearRect(0,0,W,H);

    // static routes
    routes.forEach(r=>{
      ctx.beginPath();
      ctx.strokeStyle=`rgba(0,245,255,${r.alpha})`;
      ctx.lineWidth=.6;
      ctx.setLineDash([4,8]);
      ctx.moveTo(r.ax*W,r.ay*H);
      const cx=(r.ax+r.bx)/2*W+(r.by-r.ay)*H*.25;
      const cy=(r.ay+r.by)/2*H-(r.bx-r.ax)*W*.1;
      ctx.quadraticCurveTo(cx,cy,r.bx*W,r.by*H);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // moving planes
    planes.forEach(p=>{
      p.t+=p.speed;
      if(p.t>1){ Object.assign(p,createPlane()); p.t=0; return; }

      const pos=bezierPt(p.ax,p.ay,p.bx,p.by,p.t);
      const prev=bezierPt(p.ax,p.ay,p.bx,p.by,Math.max(0,p.t-.005));
      const ang=Math.atan2(pos.y-prev.y,pos.x-prev.x);

      p.trail.push({x:pos.x,y:pos.y,a:p.alpha});
      if(p.trail.length>28) p.trail.shift();

      // draw trail
      for(let i=1;i<p.trail.length;i++){
        const ta=p.trail[i].a*(i/p.trail.length)*.5;
        ctx.beginPath();
        ctx.strokeStyle=`rgba(0,245,255,${ta})`;
        ctx.lineWidth=.8;
        ctx.moveTo(p.trail[i-1].x,p.trail[i-1].y);
        ctx.lineTo(p.trail[i].x,p.trail[i].y);
        ctx.stroke();
      }

      // draw plane dot with glow
      ctx.save();
      ctx.translate(pos.x,pos.y);
      ctx.rotate(ang);
      ctx.shadowColor='rgba(0,245,255,.9)';
      ctx.shadowBlur=8;
      ctx.fillStyle=`rgba(0,245,255,${p.alpha})`;
      ctx.beginPath();
      // simple diamond
      ctx.moveTo(0,-p.size*2.2);
      ctx.lineTo(p.size*.7,p.size);
      ctx.lineTo(0,0);
      ctx.lineTo(-p.size*.7,p.size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // node dots at waypoints
    });

    // city dots
    nodes.forEach(n=>{
      ctx.beginPath();
      ctx.arc(n.x*W,n.y*H,1.8,0,Math.PI*2);
      ctx.fillStyle='rgba(0,245,255,.25)';
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
})();
