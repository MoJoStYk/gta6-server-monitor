'use strict';
const $=id=>document.getElementById(id);
const countries=[['España','🇪🇸'],['Alemania','🇩🇪'],['Francia','🇫🇷'],['Reino Unido','🇬🇧'],['Italia','🇮🇹'],['Países Bajos','🇳🇱'],['Polonia','🇵🇱'],['Irlanda','🇮🇪'],['Estados Unidos','🇺🇸'],['Canadá','🇨🇦'],['Nueva Zelanda','🇳🇿']];
const labels={operational:'OPERATIVO',degraded:'DEGRADADO',outage:'INCIDENCIA',unreachable:'SIN CONEXIÓN',unknown:'SIN DATOS'};
const serviceIcons={'Gestión de cuentas':'♙','Juegos y redes sociales':'◈','PlayStation Store':'▣'};
let data=null,history=[],selected='España',filter='all',previous={},seconds=60,busy=false,hasLoaded=false;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state=s=>['operational','degraded','outage','unreachable','unknown'].includes(s)?s:'unknown';
const statusText=s=>labels[state(s)];
function fmtDate(s){if(!s)return 'Pendiente';const d=new Date(s);return Number.isNaN(d.getTime())?'Fecha desconocida':d.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
const flagCodes={'España':'es','Alemania':'de','Francia':'fr','Reino Unido':'gb','Italia':'it','Países Bajos':'nl','Polonia':'pl','Irlanda':'ie','Estados Unidos':'us','Canadá':'ca','Nueva Zelanda':'nz'};
function flag(name){return countries.find(c=>c[0]===name)?.[1]||'🌍';}
function flagMarkup(name){const code=flagCodes[name];return code?`<img class="country-flag" src="/static/flags/${code}.svg?v=2-4" alt="Bandera de ${safe(name)}" loading="lazy" width="60" height="40">`:`<span class="flag-fallback">🌍</span>`;}
function overallStatus(rs){if(!rs.length)return 'unknown';if(rs.some(r=>r.status==='outage'))return 'outage';if(rs.some(r=>r.status==='degraded'))return 'degraded';if(rs.some(r=>!['operational','outage','degraded'].includes(r.status)))return 'unknown';return 'operational';}
function render(){if(!data)return;const rs=Array.isArray(data.regions)?data.regions:[];const ok=rs.filter(r=>r.status==='operational').length;const bad=rs.filter(r=>['outage','degraded'].includes(r.status)).length;const missing=rs.filter(r=>!['operational','outage','degraded'].includes(r.status)).length;const overall=overallStatus(rs);
 $('updated').textContent=fmtDate(data.updated_at);$('overall').className='hero-status '+overall;$('overall').textContent=overall==='operational'?'Todo operativo':overall==='degraded'?'Servicio degradado':overall==='outage'?'Incidencia detectada':'Datos incompletos';$('overall-note').textContent=overall==='operational'?`Sin incidencias publicadas en los ${rs.length} países`:overall==='unknown'?'Una o más regiones no tienen datos fiables':'Sony ha publicado incidencias en alguna región';
 $('online-count').innerHTML=ok+' <span>/ '+rs.length+'</span>';$('online-note').textContent=missing?`${missing} región(es) sin datos`:'Según los datos publicados';$('incident-count').textContent=bad;$('incident-note').textContent=bad?'Regiones con incidencias':'Ninguna incidencia detectada';
 const times=rs.map(r=>r.latency_ms).filter(x=>typeof x==='number'&&Number.isFinite(x));$('latency').innerHTML=times.length?Math.round(Math.max(...times))+' <span>ms</span>':'— <span>ms</span>';
 $('availability').textContent=rs.length?`${ok}/${rs.length}`:'—';$('availability-ring').style.setProperty('--percent',rs.length?100*ok/rs.length:0);$('availability-ring').style.setProperty('--ring-color',overall==='operational'?'var(--green)':overall==='outage'?'var(--red)':overall==='degraded'?'var(--yellow)':'var(--neutral)');
 const shown=rs.filter(r=>filter==='all'||(filter==='operational'?r.status==='operational':r.status!=='operational'));
 $('regions').innerHTML=shown.length?shown.map(r=>`<button class="region-card ${selected===r.region?'selected':''}" data-region="${safe(r.region)}" aria-label="Ver servicios de ${safe(r.region)}"><div class="region-card-top"><span class="flag">${flagMarkup(r.region)}</span><span class="status-chip ${state(r.status)}">${statusText(r.status)}</span></div><div class="region-name">${safe(r.region)}</div><div class="region-detail">${typeof r.latency_ms==='number'?Math.round(r.latency_ms)+' ms':'Sin respuesta'} · ${Object.keys(r.services||{}).length} servicios seguidos</div></button>`).join(''):'<div class="empty-state">No hay países que coincidan con este filtro.</div>';
 $('regions').querySelectorAll('[data-region]').forEach(el=>el.addEventListener('click',()=>{selected=el.dataset.region;render();}));renderServices(rs);maybeNotify(rs);
}
function renderServices(rs){let r=rs.find(x=>x.region===selected);if(!r){r=rs[0];if(!r){$('services').innerHTML='<div class="empty-state">Sin datos disponibles.</div>';return;}selected=r.region;}$('selected-country').innerHTML=flagMarkup(r.region)+' <span>'+safe(r.region)+'</span>';const entries=Object.entries(r.services||{});$('services').innerHTML=entries.length?entries.map(([name,s])=>`<div class="service-row"><div class="service-icon">${serviceIcons[name]||'◉'}</div><div class="service-title">${safe(name)}<span class="service-sub">Estado publicado para ${safe(r.region)}</span></div><span class="service-state ${state(s)}">● ${statusText(s)}</span></div>`).join(''):'<div class="empty-state">No hay detalles de servicios para este país.</div>'}
function maybeNotify(rs){const next={};for(const r of rs){next[r.region]=r.status;if(hasLoaded&&previous[r.region]&&previous[r.region]!==r.status&&['outage','degraded'].includes(r.status)&&'Notification'in window&&Notification.permission==='granted')new Notification('PSN · Incidencia publicada',{body:`${r.region}: ${statusText(r.status)}`,tag:'psn-'+r.region});}previous=next;hasLoaded=true;}
async function refresh(){if(busy)return;busy=true;$('refresh-now').disabled=true;try{const response=await fetch('/api/status',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);data=await response.json();seconds=Math.max(30,Number(data.next_check_seconds)||60);render();await loadHistory();}catch(err){$('overall').textContent='Error de conexión';$('overall').className='hero-status unknown';$('overall-note').textContent='No se ha podido consultar el monitor: '+err.message;}finally{busy=false;$('refresh-now').disabled=false;}}
async function loadHistory(){try{const response=await fetch('/api/history?hours='+encodeURIComponent($('period').value),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const result=await response.json();history=Array.isArray(result)?result:[];renderHistory();}catch(err){$('history-chart').innerHTML='<div class="empty-state">No se ha podido cargar el historial.</div>';}}
function renderHistory(){if(!history.length){$('history-chart').innerHTML='<div class="empty-state">Aún no hay registros para este periodo.</div>';return;}
 const end=Date.now(),hours=Number($('period').value),start=end-hours*3600000,slots=48,slotWidth=(end-start)/slots;
 const names=[...new Set([...countries.map(([name])=>name),...history.map(item=>item.region)])];
 const groups=new Map(names.map(name=>[name,Array.from({length:slots},()=>[])]));
 for(const item of history){const t=Date.parse(item.time);if(!Number.isFinite(t)||t<start||t>end||!groups.has(item.region))continue;const i=Math.min(slots-1,Math.floor((t-start)/slotWidth));groups.get(item.region)[i].push(state(item.status));}
 const priority=['outage','degraded','unknown','unreachable','operational'];const worst=arr=>priority.find(s=>arr.includes(s))||'empty';
 $('history-chart').innerHTML=names.map(name=>`<div class="history-row"><span class="history-name">${flagMarkup(name)} ${safe(name)}</span><div class="history-bar" role="img" aria-label="Historial de ${safe(name)}">${groups.get(name).map((arr,i)=>`<span class="history-cell ${worst(arr)}" title="${safe(name)} · ${new Date(start+i*slotWidth).toLocaleString('es-ES')} · ${arr.length?statusText(worst(arr)):'Sin registro'}"></span>`).join('')}</div></div>`).join('')+`<div class="history-axis"><span>Hace ${hours} h</span><span>Ahora</span></div>`;
}
$('refresh-now').addEventListener('click',refresh);$('period').addEventListener('change',loadHistory);document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render();}));
$('notify').addEventListener('click',async()=>{if(!('Notification'in window)){alert('Este navegador no admite notificaciones.');return;}try{const permission=await Notification.requestPermission();$('notify').textContent=permission==='granted'?'✓ Avisos activados':'Avisos no permitidos';}catch(e){alert('No se han podido activar las notificaciones.');}});
setInterval(()=>{$('countdown').textContent=Math.max(0,seconds--)+' s';},1000);setInterval(refresh,60000);refresh();

// Cuenta atrás independiente del temporizador de actualización de PSN.
// Medianoche del 19 de noviembre en Madrid (CET, UTC+01:00).
const launchTimestamp = Date.parse('2026-11-19T00:00:00+01:00');
function updateLaunchCountdown(){
 const remaining=Math.max(0,launchTimestamp-Date.now());
 const totalSeconds=Math.floor(remaining/1000);
 const days=Math.floor(totalSeconds/86400),hours=Math.floor(totalSeconds%86400/3600);
 const minutes=Math.floor(totalSeconds%3600/60),seconds=totalSeconds%60;
 for(const [unit,value] of [['days',days],['hours',hours],['minutes',minutes],['seconds',seconds]]){
  const el=$('launch-'+unit);if(el)el.textContent=String(value).padStart(2,'0');
 }
 const message=$('launch-message');
 if(message)message.textContent=remaining===0?'¡Ha llegado la fecha anunciada de lanzamiento!':'LA NOCHE MÁS ESPERADA SE ACERCA';
}
updateLaunchCountdown();
setInterval(updateLaunchCountdown,1000);

// Rockstar: consulta independiente, sin modificar el renderizado de PSN.
const rockstarLabels={operational:'OPERATIVO',degraded:'LIMITADO',outage:'CAÍDA',unknown:'SIN DATOS',unreachable:'SIN CONEXIÓN'};
function rockstarEscape(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function refreshRockstar(){
 try{
  const r=await fetch('/api/rockstar/status',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();const overall=document.getElementById('rockstar-overall');
  const state=d.status||'unknown';overall.textContent=rockstarLabels[state]||'SIN DATOS';overall.className='rockstar-overall '+state;
  document.getElementById('rockstar-updated').textContent=d.updated_at?'Consulta: '+new Date(d.updated_at).toLocaleString('es-ES'):'Esperando consulta';
  const items=Object.entries(d.services||{});
  document.getElementById('rockstar-services').innerHTML=items.length?items.map(([name,s])=>`<div class="rockstar-service"><span>${rockstarEscape(name)}</span><b class="rockstar-state ${rockstarEscape(s)}">${rockstarLabels[s]||'SIN DATOS'}</b></div>`).join(''):'<div class="loading">Rockstar todavía no ha proporcionado datos interpretables.</div>';
 }catch(e){document.getElementById('rockstar-overall').textContent='SIN CONEXIÓN';document.getElementById('rockstar-services').textContent='No se ha podido consultar el monitor Rockstar.';}
}
// Historial por intervalos de tiempo: evita representar periodos sin datos como operativos.
const rockstarOrder=['GTA Online · PS5','GTA Online · PS4','GTA Online · Xbox Series X|S','GTA Online · Xbox One','GTA Online · PC','Red Dead Online · PC','Autenticación Rockstar','Rockstar Games Launcher','Rockstar Store'];
const rockstarSeverity={unknown:0,operational:1,degraded:2,outage:3,unreachable:3};
function rockstarSlotTime(ts){return new Date(ts).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
async function refreshRockstarHistory(){
 const node=document.getElementById('rockstar-history');const hours=Number(document.getElementById('rockstar-period').value);
 try{
  const r=await fetch('/api/rockstar/history?hours='+hours,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();if(!Array.isArray(data)||!data.length){node.textContent='El historial de Rockstar comenzará con las próximas comprobaciones.';return;}
  const end=Date.now(),start=end-hours*3600000,slots=48,slotDuration=(end-start)/slots;
  const groups=new Map();for(const item of data){if(!item||typeof item.service!=='string')continue;const ts=Date.parse(item.time);if(!Number.isFinite(ts)||ts<start||ts>end)continue;
   if(!groups.has(item.service))groups.set(item.service,Array(slots).fill('unknown'));
   const i=Math.min(slots-1,Math.floor((ts-start)/slotDuration)),arr=groups.get(item.service),state=Object.hasOwn(rockstarSeverity,item.status)?item.status:'unknown';
   if(rockstarSeverity[state]>rockstarSeverity[arr[i]])arr[i]=state;
  }
  const names=[...rockstarOrder.filter(n=>groups.has(n)),...[...groups.keys()].filter(n=>!rockstarOrder.includes(n)).sort()];
  if(!names.length){node.textContent='No hay comprobaciones válidas para el periodo seleccionado.';return;}
  node.innerHTML=names.map(name=>`<div class="rockstar-history-row"><span class="rockstar-history-name">${rockstarEscape(name)}</span><div class="rockstar-history-bar" role="group" aria-label="Historial ${rockstarEscape(name)}">${groups.get(name).map((state,i)=>{
    const from=start+i*slotDuration,to=Math.min(end,from+slotDuration);
    const label=rockstarLabels[state]||'SIN DATOS';const tooltip=`${name} | ${rockstarSlotTime(from)} – ${rockstarSlotTime(to)} | ${label}${state==='unknown'?' (sin lectura confirmada)':''}`;
    return `<i class="${rockstarEscape(state)}" title="${rockstarEscape(tooltip)}" aria-label="${rockstarEscape(tooltip)}" tabindex="0" data-tooltip="${rockstarEscape(tooltip)}"></i>`;
   }).join('')}</div></div>`).join('');
 }catch(e){node.textContent='No se ha podido cargar el historial Rockstar.';}
}
document.getElementById('rockstar-period').addEventListener('change',refreshRockstarHistory);
refreshRockstar();refreshRockstarHistory();setInterval(()=>{refreshRockstar();refreshRockstarHistory();},60000);
