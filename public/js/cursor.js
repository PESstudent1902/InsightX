/* cursor.js — airplane SVG cursor that rotates toward direction of travel */
(function(){
  let mx=window.innerWidth/2, my=window.innerHeight/2;
  let px=mx, py=my, angle=0;
  const cur = document.getElementById('f404-cursor');
  const dot = document.getElementById('f404-cursor-dot');
  if(!cur||!dot) return;

  document.addEventListener('mousemove', e=>{
    const dx=e.clientX-mx, dy=e.clientY-my;
    if(Math.abs(dx)+Math.abs(dy)>2){
      angle = Math.atan2(dy,dx) * 180/Math.PI + 90;
    }
    mx=e.clientX; my=e.clientY;
    cur.style.left=mx+'px'; cur.style.top=my+'px';
    cur.style.transform=`translate(-50%,-50%) rotate(${angle}deg)`;
  });

  // trail follows with lag
  function animDot(){
    px+=(mx-px)*.18; py+=(my-py)*.18;
    dot.style.left=px+'px'; dot.style.top=py+'px';
    requestAnimationFrame(animDot);
  }
  animDot();

  // cursor grow on clickable elements
  document.addEventListener('mouseover', e=>{
    if(e.target.closest('button,a,[role="button"]')){
      cur.style.transform=`translate(-50%,-50%) rotate(${angle}deg) scale(1.5)`;
    }
  });
  document.addEventListener('mouseout', e=>{
    if(e.target.closest('button,a,[role="button"]')){
      cur.style.transform=`translate(-50%,-50%) rotate(${angle}deg) scale(1)`;
    }
  });
})();
