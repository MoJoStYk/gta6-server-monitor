/* THE WIRE 3.7 · noticias RSS gratuitas; renderizado seguro sin innerHTML. */
(()=>{
 const list=document.getElementById('vc-news-list');if(!list)return;
 const status=document.getElementById('vc-news-state'),update=document.getElementById('vc-news-update');
 const tabs=[...document.querySelectorAll('[data-news-tab]')];let current='recent',data=null;
 const node=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e;};
 function render(){
  tabs.forEach(b=>{const on=b.dataset.newsTab===current;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  list.replaceChildren();if(!data?.items?.length)return;
  const items=[...data.items];
  if(current==='popular')items.sort((a,b)=>(b.relevance||0)-(a.relevance||0)||Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
  else items.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
  items.slice(0,12).forEach((p,i)=>{
   const card=node('article','vc-news-card');card.append(node('div','vc-news-card-index',(current==='popular'?'DESTACADA':'TRANSMISIÓN')+' / '+String(i+1).padStart(2,'0')));
   const head=node('div','vc-news-card-head');head.append(node('strong','',p.publisher||'Fuente externa'));
   let when='';try{if(p.created_at)when=new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(p.created_at));}catch(_){}
   head.append(node('span','',when));card.append(head,node('p','',p.title||p.text||''));
   card.append(node('div','vc-news-card-meta',(p.category||'GTA')+' · '+(p.official?'Fuente oficial':'Medio externo')+(current==='popular'?' · Selección editorial':'')));
   const url=String(p.url||'');if(/^https:\/\//i.test(url)){const a=node('a','','LEER NOTICIA ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
   list.append(card);
  });
 }
 tabs.forEach(b=>b.addEventListener('click',()=>{current=b.dataset.newsTab;render();}));
 async function load(){try{
  const r=await fetch('/api/news',{cache:'no-store'});const j=await r.json();data=j;
  status.textContent=!r.ok||j.state!=='ok'?'No se han podido recuperar noticias de las fuentes públicas. Se reintentará automáticamente.':
   j.items.length?(j.partial?'Noticias disponibles; alguna fuente no respondió.':'Noticias públicas disponibles · fecha y selección editorial.'):'No hay noticias recientes en las fuentes consultadas.';
  update.textContent='Fuente: RSS público'+(j.fetched_at?' · '+new Date(j.fetched_at).toLocaleTimeString('es-ES'):'');render();
 }catch(_){status.textContent='Servicio de noticias temporalmente no disponible. PSN y Rockstar siguen independientes.';}}
 load();setInterval(load,300000);
})();
