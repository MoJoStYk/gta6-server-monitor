/* THE WIRE Premium 3.8 · filtros, búsqueda, agrupación conservadora, fuente verificada. */
(()=>{
 'use strict';
 const list=document.getElementById('vc-news-list');if(!list)return;
 const status=document.getElementById('vc-news-state'),update=document.getElementById('vc-news-update');
 const results=document.getElementById('vc-news-results'),search=document.getElementById('vc-news-search');
 const groupToggle=document.getElementById('vc-news-group');
 const tabs=[...document.querySelectorAll('[data-news-tab]')];
 const filters=[...document.querySelectorAll('[data-news-filter]')];
 let current='recent',filter='all',data=null;
 const node=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e;};
 const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const words=s=>fold(s).replace(/\b(rockstar games|grand theft auto vi|gta 6)\b/g,'gta vi').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!['para','con','del','una','que','los','las','por','como','sobre','desde','este','esta','the','and','news','juego','videojuego'].includes(w));
 const official=p=>p.official===true && (()=>{try{const u=new URL(p.url);return u.protocol==='https:'&&(u.hostname==='rockstargames.com'||u.hostname.endsWith('.rockstargames.com'));}catch(_){return false;}})();
 function topic(p){const t=fold(p.title||'');return /gta vi|gta 6|grand theft auto vi/.test(t)?'gta':/rockstar|gta online|red dead/.test(t)?'rockstar':fold(p.category)==='gta vi'?'gta':'other';}
 function similar(a,b){
  if(topic(a)!==topic(b))return false;
  const x=new Set(words(a.title)),y=new Set(words(b.title));if(x.size<4||y.size<4)return false;
  const common=[...x].filter(w=>y.has(w)).length;
  return common>=4 && common/Math.min(x.size,y.size)>=.72 && common/new Set([...x,...y]).size>=.48;
 }
 function groupItems(items){const groups=[];for(const p of items){const g=groups.find(g=>similar(g[0],p));if(g)g.push(p);else groups.push([p]);}return groups;}
 function render(){
  tabs.forEach(b=>{const on=b.dataset.newsTab===current;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  filters.forEach(b=>{const on=b.dataset.newsFilter===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  list.replaceChildren();if(!data?.items?.length){results.textContent='';return;}
  const query=fold(search?.value.trim()||'');
  let items=data.items.filter(p=>{
   const ok=filter==='all'||(filter==='official'?official(p):topic(p)===filter);
   return ok&&(!query||fold([p.title,p.text,p.publisher,p.category].join(' ')).includes(query));
  });
  if(current==='popular')items.sort((a,b)=>(Number(b.relevance)||0)-(Number(a.relevance)||0)||Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
  else items.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
  const groups=groupToggle?.checked?groupItems(items):items.map(p=>[p]);
  results.textContent=items.length?`${groups.length} noticias o grupos · ${items.length} artículos encontrados${groupToggle?.checked?' · agrupación aproximada':''}`:'No hay noticias que coincidan con los filtros. Prueba otra búsqueda.';
  groups.slice(0,12).forEach((g,i)=>{
   const p=g[0],card=node('article','vc-news-card');
   card.append(node('div','vc-news-card-index',(current==='popular'?'DESTACADA':'TRANSMISIÓN')+' / '+String(i+1).padStart(2,'0')));
   const head=node('div','vc-news-card-head');head.append(node('strong','',p.publisher||'Fuente externa'));
   let when='';try{if(p.created_at)when=new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(p.created_at));}catch(_){}
   head.append(node('span','',when));card.append(head);
   const badge=node('span','vc-news-source-badge '+(official(p)?'verified':'external'),official(p)?'✓ ROCKSTAR · ENLACE OFICIAL VERIFICADO':p.attributed_official?'ATRIBUIDA A ROCKSTAR · ENLACE SIN VERIFICAR':'MEDIO EXTERNO');card.append(badge);
   card.append(node('p','',p.title||p.text||''));
   card.append(node('div','vc-news-card-meta',(p.category||'GTA')+' · '+(current==='popular'?'Selección editorial · ':'')+(g.length>1?g.length+' artículos relacionados':'Noticia individual')));
   function linkFor(item,label){const url=String(item.url||'');if(!/^https:\/\//i.test(url))return null;const a=node('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
   const primary=linkFor(p,'LEER NOTICIA ↗');if(primary)card.append(primary);
   if(g.length>1){const details=node('details','vc-news-related'),summary=node('summary','',`VER ${g.length-1} FUENTE${g.length===2?'':'S'} RELACIONADA${g.length===2?'':'S'}`);details.append(summary);g.slice(1).forEach(item=>{const l=linkFor(item,`${item.publisher||'Fuente externa'} · ${item.title||'Artículo'} ↗`);if(l)details.append(l);});card.append(details);}
   list.append(card);
  });
 }
 tabs.forEach(b=>b.addEventListener('click',()=>{current=b.dataset.newsTab;render();}));
 filters.forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.newsFilter;render();}));
 search?.addEventListener('input',render);groupToggle?.addEventListener('change',render);
 async function load(){try{
  const r=await fetch('/api/news',{cache:'no-store'});const j=await r.json();if(!r.ok||!Array.isArray(j.items))throw Error('Datos no válidos');data=j;
  status.textContent=j.state!=='ok'?'No se han podido recuperar noticias de las fuentes públicas. Se reintentará automáticamente.':
   j.items.length?(j.partial?'Noticias disponibles; alguna fuente no respondió.':'Noticias públicas disponibles · fecha y selección editorial.'):'No hay noticias recientes en las fuentes consultadas.';
  update.textContent='Fuente: RSS público'+(j.fetched_at?' · '+new Date(j.fetched_at).toLocaleTimeString('es-ES'):'');render();
 }catch(_){status.textContent='Servicio de noticias temporalmente no disponible. PSN y Rockstar siguen independientes.';}}
 load();setInterval(load,300000);
})();
