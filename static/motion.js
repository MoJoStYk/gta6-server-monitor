/* GTA VI Premium 3.1: optional cosmetic animations only. */
(()=>{
  const button=document.getElementById('motion-toggle');
  if(!button)return;
  const reduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enabled=!reduced;
  try{const saved=localStorage.getItem('vc-motion-enabled');if(saved!==null)enabled=saved==='true'&&!reduced;}catch(_){}
  function render(){document.body.classList.toggle('motion-off',!enabled);button.textContent=enabled?'✦ Animaciones: ON':'✦ Animaciones: OFF';button.setAttribute('aria-pressed',String(enabled));}
  button.addEventListener('click',()=>{enabled=!enabled;render();try{localStorage.setItem('vc-motion-enabled',String(enabled));}catch(_){}});
  render();
  // Tiny pointer parallax; visual only, no data requests or monitoring changes.
  const art=document.querySelector('.collage-art');
  if(art && window.matchMedia && window.matchMedia('(pointer:fine)').matches){
    art.addEventListener('pointermove',event=>{
      if(!enabled || reduced)return;
      const r=art.getBoundingClientRect();
      const x=((event.clientX-r.left)/r.width-.5)*10;
      const y=((event.clientY-r.top)/r.height-.5)*7;
      art.style.setProperty('--cinema-x',x.toFixed(1)+'px');
      art.style.setProperty('--cinema-y',y.toFixed(1)+'px');
    },{passive:true});
    art.addEventListener('pointerleave',()=>{
      art.style.setProperty('--cinema-x','0px');
      art.style.setProperty('--cinema-y','0px');
    });
  }
})();
