/* Premium 3.5 — Newsroom. Never uses innerHTML for untrusted X posts. */
(()=>{
 const list=document.getElementById('vc-news-list');if(!list)return;
 const status=document.getElementById('vc-news-state');const update=document.getElementById('vc-news-update');
 const tabs=[...document.querySelectorAll('[data-news-tab]')];let current='recent';let data=null;
 const node=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=String(txt);return el;};
 const fmt=(n)=>new Intl.NumberFormat('es-ES',{notation:'compact',maximumFractionDigits:1}).format(n||0);
 function render(){
  tabs.forEach(b=>{const on=b.dataset.newsTab===current;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  list.replaceChildren();if(!data||!data.items||!data.items.length)return;
  const items=[...data.items];
  if(current==='popular')items.sort((a,b)=>(b.engagement||0)-(a.engagement||0));
  else items.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
  for(const p of items.slice(0,12)){
   const card=node('article','vc-news-card');card.append(node('div','vc-news-card-index','TRANSMISIÓN / '+String(items.indexOf(p)+1).padStart(2,'0')));const head=node('div','vc-news-card-head');
   head.append(node('strong','',p.username?'@'+p.username:'Publicación en X'));
   let when='';try{when=new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(p.created_at));}catch(_){}
   head.append(node('span','',when));card.append(head,node('p','',p.text||''));
   const m=p.metrics||{};card.append(node('div','vc-news-card-meta','♥ '+fmt(m.like_count)+' · ↻ '+fmt(m.retweet_count)+' · 💬 '+fmt(m.reply_count)));
   const link=node('a','','Ver publicación en X ↗');link.href='https://x.com/i/web/status/'+encodeURIComponent(p.id);link.target='_blank';link.rel='noopener noreferrer';card.append(link);list.append(card);
  }
 }
 tabs.forEach(b=>b.addEventListener('click',()=>{current=b.dataset.newsTab;render()}));
 async function load(){
  try{const r=await fetch('/api/news',{cache:'no-store'});const j=await r.json();data=j;
   if(!r.ok||j.state!=='ok'){
    const messages={not_configured:'Para activar las noticias en directo, añade X_BEARER_TOKEN en Railway → Variables.',rate_limited:'X ha limitado temporalmente las consultas. Se reintentará automáticamente.',unavailable:'No se pueden recuperar publicaciones de X ahora mismo.'};
    status.textContent=messages[j.state]||'No hay publicaciones disponibles en este momento.';
   }else{status.textContent=j.items.length?'Publicaciones recuperadas de X · ordena por fecha o interacciones.':'No se han encontrado publicaciones en esta búsqueda.';}
   update.textContent='Fuente: X'+(j.fetched_at?' · consulta '+new Date(j.fetched_at).toLocaleTimeString('es-ES'): '');render();
  }catch(_){status.textContent='No se puede conectar con el servicio de noticias. Los monitores PSN y Rockstar siguen independientes.';}
 }
 load();setInterval(load,300000);
})();
