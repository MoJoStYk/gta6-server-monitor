/* GTA VI Premium 3.1.1: optional cosmetic animations only. */
(()=>{
  const button=document.getElementById('motion-toggle');
  if(!button)return;
  const reduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enabled=!reduced;
  try{const saved=localStorage.getItem('vc-motion-enabled');if(saved!==null)enabled=saved==='true'&&!reduced;}catch(_){}
  function render(){document.body.classList.toggle('motion-off',!enabled);button.textContent=enabled?'✦ Animaciones: ON':'✦ Animaciones: OFF';button.setAttribute('aria-pressed',String(enabled));}
  button.addEventListener('click',()=>{enabled=!enabled;render();try{localStorage.setItem('vc-motion-enabled',String(enabled));}catch(_){}});
  render();

})();
