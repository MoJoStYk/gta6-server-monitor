const $=id=>document.getElementById(id);
const statusLabel={operational:"OPERATIVO",degraded:"DEGRADADO",outage:"CAÍDA PUBLICADA",unreachable:"SIN LECTURA",unknown:"SIN DATOS"};
let previous={};
let history=[];
const colors={operational:"#48d597",degraded:"#ffc857",outage:"#ff657a",unreachable:"#778195",unknown:"#778195"};

function fmtTime(s){if(!s)return "—";return new Date(s).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"medium"});}
function overallStatus(regions){
 const valid=regions.filter(r=>r.status!=="unreachable"&&r.status!=="unknown");
 if(!valid.length)return "unknown";
 if(valid.some(r=>r.status==="outage"))return "outage";
 if(valid.some(r=>r.status==="degraded"))return "degraded";
 return "operational";
}
function serviceAggregate(regions,key){
 const vals=regions.map(r=>Object.values(r.services||{})).flat();
 const s=regions.map(r=>r.services||{}).map(x=>key==="store"?x["PlayStation Store"]:x["Juegos y redes sociales"]).filter(Boolean);
 if(s.includes("outage"))return "outage";if(s.includes("degraded"))return "degraded";
 if(s.length&&s.every(x=>x==="operational"))return "operational";return "unknown";
}
function maybeNotify(regions){
 const now={};regions.forEach(r=>now[r.region]=r.status);
 const changed=[];
 for(const [region,status] of Object.entries(now)){
   if(previous[region] && previous[region]!==status && ["outage","degraded","unreachable"].includes(status))changed.push(`${region}: ${statusLabel[status]}`);
 }
 previous=now;
 if(changed.length && Notification.permission==="granted"){
   new Notification("GTA VI Monitor · Cambio detectado",{body:changed.join(" · "),tag:"psn-status-change"});
 }
}
function render(data){
 const rs=data.regions||[];
 $("updated").textContent=fmtTime(data.updated_at);
 const overall=overallStatus(rs);
 $("overall").textContent=statusLabel[overall];$("overall").className=overall;
 $("overall-note").textContent=overall==="operational"?"Sin incidencias publicadas en las regiones consultadas":overall==="unknown"?"No hay datos suficientes":"Se ha detectado una incidencia publicada";
 const store=serviceAggregate(rs,"store"), gaming=serviceAggregate(rs,"gaming");
 $("store").textContent=statusLabel[store];$("store").className=store;
 $("gaming").textContent=statusLabel[gaming];$("gaming").className=gaming;
 $("failed").textContent=rs.filter(r=>["unreachable","unknown"].includes(r.status)).length;
 $("regions").innerHTML=rs.map(r=>`<article class="region"><div class="region-top"><span>${r.region}</span><span class="${r.status}">●</span></div><b class="${r.status}">${statusLabel[r.status]||"SIN DATOS"}</b><small>${r.latency_ms??"—"} ms · ${r.detail||""}</small></article>`).join("");
 maybeNotify(rs);
}
async function refresh(){
 try{const r=await fetch("/api/status",{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);render(await r.json());await loadHistory();}
 catch(e){$("overall").textContent="ERROR DE MONITOR";$("overall").className="unreachable";$("overall-note").textContent=e.message;}
}
async function loadHistory(){
 try{const r=await fetch("/api/history?hours="+$("period").value);history=await r.json();drawChart();}catch(e){}
}
function drawChart(){
 const c=$("chart"),ctx=c.getContext("2d"),dpr=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;
 c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
 const names=["España","Alemania","Francia","Reino Unido","Italia","Países Bajos","Polonia","Irlanda"];
 const vals={operational:1,degraded:2,outage:3,unreachable:0,unknown:0};
 const rows=history.filter(x=>x.region==="España");
 if(!rows.length){ctx.fillStyle="#9aa5b8";ctx.font="13px system-ui";ctx.fillText("El histórico aparecerá después de las primeras comprobaciones.",12,30);return;}
 const plot={x:34,y:12,w:w-48,h:h-42};ctx.strokeStyle="#293144";ctx.fillStyle="#9aa5b8";ctx.font="10px system-ui";
 for(let i=0;i<4;i++){let y=plot.y+plot.h-i*plot.h/3;ctx.beginPath();ctx.moveTo(plot.x,y);ctx.lineTo(plot.x+plot.w,y);ctx.stroke();ctx.fillText(["Sin lectura","Operativo","Degradado","Caída"][i],0,y+3);}
 const step=plot.w/Math.max(rows.length-1,1);
 rows.forEach((r,i)=>{let x=plot.x+i*step,y=plot.y+plot.h-(vals[r.status]||0)*plot.h/3;ctx.fillStyle=colors[r.status]||colors.unknown;ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill();});
 ctx.fillStyle="#9aa5b8";ctx.fillText("España · registros de estado publicados por Sony",plot.x, h-8);
}
$("notify").addEventListener("click",async()=>{if(!("Notification"in window)){alert("Este navegador no admite notificaciones.");return;}const p=await Notification.requestPermission();$("notify").textContent=p==="granted"?"Notificaciones activadas":"Notificaciones no permitidas";});
$("period").addEventListener("change",loadHistory);
window.addEventListener("resize",drawChart);
refresh();setInterval(refresh,60000);
