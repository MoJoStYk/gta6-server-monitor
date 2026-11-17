/* Rockstar Historical Analytics · Vice City Premium 2.7. Read-only API; no backend changes. */
(()=>{'use strict';
 const period=document.getElementById('rockstar-period');if(!period)return;
 const $=id=>document.getElementById(id);
 const order=['GTA Online · PS5','GTA Online · PS4','GTA Online · Xbox Series X|S','GTA Online · Xbox One','GTA Online · PC','Red Dead Online · PC','Autenticación Rockstar','Rockstar Games Launcher','Rockstar Store'];
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>new Intl.NumberFormat('es-ES').format(n);
 const percent=(n,d)=>d?(100*n/d).toFixed(1).replace('.',',')+' %':'—';
 let serial=0;
 async function update(){const seq=++serial,hours=Number(period.value)||24;
  $('rs-window').textContent=hours===1?'Última hora':hours===24?'24 horas':hours===72?'3 días':'7 días';
  try{const res=await fetch('/api/rockstar/history?hours='+hours,{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);
   const rows=await res.json();if(seq!==serial)return;if(!Array.isArray(rows))throw Error('Respuesta inesperada');
   const end=Date.now(),start=end-hours*3600000,slots=48,step=(end-start)/slots;
   const groups=new Map(),covered=new Set();let total=0,good=0,issues=0,unknown=0,lastIssue=null;
   for(const r of rows){if(!r||typeof r.service!=='string')continue;const ts=Date.parse(r.time);if(!Number.isFinite(ts)||ts<start||ts>end)continue;
    const status=String(r.status||'unknown');const known=status==='operational'||status==='degraded'||status==='outage';
    if(!groups.has(r.service))groups.set(r.service,{ok:0,issue:0,unknown:0,total:0});const g=groups.get(r.service);g.total++;total++;
    covered.add(Math.min(slots-1,Math.floor((ts-start)/step)));
    if(status==='operational'){good++;g.ok++;}else if(status==='degraded'||status==='outage'){issues++;g.issue++;if(!lastIssue||ts>lastIssue.ts)lastIssue={ts,service:r.service,status};}else{unknown++;g.unknown++;}
   }
   $('rs-readings').textContent=fmt(total);$('rs-operational').textContent=percent(good,good+issues);
   $('rs-issues').textContent=fmt(issues);$('rs-coverage').textContent=percent(covered.size,slots);
   $('rs-summary').textContent=total?`${fmt(groups.size)} servicios con registros · ${fmt(unknown)} lecturas sin estado interpretable. ${lastIssue?'Última incidencia observada: '+lastIssue.service+' ('+(lastIssue.status==='outage'?'caída':'limitado')+'), '+new Date(lastIssue.ts).toLocaleString('es-ES')+'.':'No hay incidencias registradas en el periodo seleccionado.'}`:'Aún no hay lecturas en el periodo seleccionado.';
   const names=[...order.filter(n=>groups.has(n)),...[...groups.keys()].filter(n=>!order.includes(n)).sort()];
   $('rs-table-body').innerHTML=names.length?names.map(name=>{const g=groups.get(name);const w=n=>(100*n/g.total).toFixed(2)+'%';return `<tr><td>${esc(name)}</td><td>${fmt(g.ok)}</td><td>${fmt(g.issue)}</td><td>${fmt(g.unknown)}</td><td>${fmt(g.total)}</td><td><div class="rs-distribution" role="img" aria-label="${esc(name)}: ${g.ok} operativas, ${g.issue} incidencias, ${g.unknown} sin datos"><i class="rs-ok" style="width:${w(g.ok)}"></i><i class="rs-issue" style="width:${w(g.issue)}"></i><i class="rs-unknown" style="width:${w(g.unknown)}"></i></div></td></tr>`;}).join(''):'<tr><td colspan="6">Sin registros en el periodo seleccionado.</td></tr>';
  }catch(e){if(seq!==serial)return;$('rs-summary').textContent='No se han podido consultar las estadísticas históricas.';$('rs-table-body').innerHTML='<tr><td colspan="6">Error al consultar el historial.</td></tr>';}
 }
 period.addEventListener('change',update);update();setInterval(update,60000);
})();

/* Premium 2.8: incident episodes derived from timestamped Rockstar observations. */
(()=>{'use strict';
 const period=document.getElementById('rockstar-period');if(!period||!document.getElementById('ri-table-body'))return;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=t=>new Date(t).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const duration=ms=>{const m=Math.round(ms/60000);return m<1?'< 1 min':m<60?m+' min':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min';};
 let requestId=0;
 async function update(){const seq=++requestId,hours=Number(period.value)||24;
  $('ri-window').textContent=hours===1?'Última hora':hours===24?'24 horas':hours===72?'3 días':'7 días';
  try{const res=await fetch('/api/rockstar/history?hours='+hours,{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const rows=await res.json();if(seq!==requestId)return;if(!Array.isArray(rows))throw Error('Datos no válidos');
   const now=Date.now(),start=now-hours*3600000,groups=new Map();
   for(const r of rows){if(!r||!r.service)continue;const t=Date.parse(r.time),status=String(r.status||'unknown');if(!Number.isFinite(t)||t<start||t>now)continue;if(!groups.has(r.service))groups.set(r.service,[]);groups.get(r.service).push({t,status});}
   const incidents=[];const GAP=3*60*1000;
   for(const [service,observations] of groups){observations.sort((a,b)=>a.t-b.t);let open=null,prev=null;
    const close=(recovery,reason)=>{if(!open)return;incidents.push({service,...open,recovery,reason});open=null;};
    for(const obs of observations){if(prev&&obs.t-prev.t>GAP)close(null,'gap');
     if(obs.status==='outage'||obs.status==='degraded'){
      if(!open)open={begin:obs.t,severity:obs.status};else if(obs.status==='outage')open.severity='outage';
     }else if(obs.status==='operational')close(obs.t,'recovered');else close(null,'unknown');
     prev=obs;
    }
    close(null,'unconfirmed');
   }
   incidents.sort((a,b)=>b.begin-a.begin);
   const affected=new Set(incidents.map(i=>i.service)).size;
   const active=incidents.filter(i=>!i.recovery).length;
   $('ri-count').textContent=String(incidents.length);$('ri-affected').textContent=String(affected);$('ri-active').textContent=String(active);
   $('ri-summary').textContent=incidents.length?`${incidents.length} episodio(s) detectado(s) en ${affected} servicio(s). ${active} sin recuperación observada dentro de una secuencia continua. Los cortes de datos no se interpretan como caídas.`:'No se han detectado episodios de incidencia en las lecturas disponibles del periodo. Esto no garantiza disponibilidad continua.';
   $('ri-table-body').innerHTML=incidents.length?incidents.slice(0,150).map(i=>`<tr><td>${esc(i.service)}</td><td>${date(i.begin)}</td><td>${i.recovery?date(i.recovery):i.reason==='gap'?'Sin confirmar (hueco de datos)':i.reason==='unknown'?'Sin confirmar (lectura desconocida)':'No observada'}</td><td>${i.recovery?duration(i.recovery-i.begin):'No calculable'}</td><td><span class="ri-severity ${i.severity==='outage'?'outage':'degraded'}">${i.severity==='outage'?'Caída':'Limitado'}</span></td></tr>`).join(''):'<tr><td colspan="5">Sin incidencias detectadas en el periodo seleccionado.</td></tr>';
  }catch(e){if(seq!==requestId)return;$('ri-summary').textContent='No se pudo cargar el registro de incidencias.';$('ri-table-body').innerHTML='<tr><td colspan="5">Error al consultar el historial.</td></tr>';}
 }
 period.addEventListener('change',update);update();setInterval(update,60000);
})();
