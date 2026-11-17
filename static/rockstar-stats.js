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
