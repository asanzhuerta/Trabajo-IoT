(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let selected = 'p1', busy = false, state = null, apiOk = false, socket, reconnect;
  const readings = new Map(), history = [];
  const endpoint = id => '/api/simulador/jugadores/' + id + '/sensores';
  const fmt = n => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('es-ES', {maximumFractionDigits:2}) : '—';
  const time = ts => new Date(ts).toLocaleTimeString('es-ES');
  function feedback(message, error = false) { $('feedback').textContent = message; $('feedback').classList.toggle('error', error); }
  for (let i=1;i<=11;i++) {
    const b = document.createElement('button'); b.type='button'; b.textContent='P'+i; b.dataset.player='p'+i;
    b.setAttribute('aria-pressed', String(i===1));
    b.onclick=()=>{ selected=b.dataset.player; render(); }; $('players').append(b);
  }
  function render() {
    $('selected').textContent=selected.toUpperCase(); $('livePlayer').textContent=selected.toUpperCase();
    $('clear').textContent='Retirar ajustes de '+selected.toUpperCase();
    for(const b of $('players').children) b.setAttribute('aria-pressed', String(b.dataset.player===selected));
    $('connection').textContent=!apiOk?'API sin conexión':state?.mqtt==='connected'?'API · MQTT conectado':'API · MQTT desconectado';
    $('connection').classList.toggle('online', apiOk && state?.mqtt==='connected');
    const j=readings.get(selected), fresh=j && j.estado==='ok' && Date.now()-Date.parse(j.ts)<6000;
    $('liveTemp').textContent=fresh?fmt(j.sensors?.thermometer?.temperature?.value)+' °C':'—';
    $('livePulse').textContent=fresh?fmt(j.sensors?.pulsemeter?.pulse?.value)+' lpm':'—';
    $('liveStatus').textContent=fresh?'Última telemetría: '+time(j.ts):'Sin telemetría reciente del jugador.';
    const phaseButton=[...document.querySelectorAll('[data-phase]')].find(b=>b.dataset.phase===state?.fase);
    $('phaseOrder').textContent=!apiOk?'Última fase solicitada: estado no disponible.':
      'Última fase solicitada: '+(phaseButton?phaseButton.textContent:'ninguna registrada')+'. No indica la fase actual del motor.';
    const a=state?.ajustes?.[selected];
    $('lastOrder').textContent=!apiOk?'Estado no disponible.':!a?'No hay una orden vigente registrada para '+selected.toUpperCase()+'.':
      [a.temperature!=null?'Temperatura: '+fmt(a.temperature)+' °C':null,a.pulse!=null?'Pulso: '+fmt(a.pulse)+' lpm':null,
        a.hasta?(Date.parse(a.hasta)>Date.now()?'Caduca en '+Math.ceil((Date.parse(a.hasta)-Date.now())/1000)+' s':'Duración de la orden finalizada'):'Hasta que se retire'].filter(Boolean).join('\n');
  }
  async function refresh() {
    try { const r=await fetch('/api/simulador',{cache:'no-store',signal:AbortSignal.timeout(6000)}); if(!r.ok) throw Error(); state=await r.json(); apiOk=true; }
    catch { apiOk=false; } render();
  }
  function duration() { if($('indefinite').checked) return 0; if(!$('duration').reportValidity()) return null; return Number($('duration').value); }
  function value(id) { return $(id).reportValidity()?Number($(id).value):null; }
  function log(entry) {
    history.unshift(entry); history.splice(20); $('history').replaceChildren();
    for(const h of history) { const row=document.createElement('div'); row.className='entry'; const title=document.createElement('strong');
      title.textContent=`${time(h.at)} · ${h.method} ${h.path} · ${h.status}`;
      const details=document.createElement('pre'); details.textContent=(h.body?JSON.stringify(h.body)+'\n':'')+h.message;
      row.append(title,details); $('history').append(row); }
  }
  async function send(method, values) {
    if(busy) return;
    const seconds=method==='PUT'?duration():0; if(seconds===null) return;
    const id=selected, phase=method==='POST';
    const path=phase?'/api/simulador/fase':endpoint(id);
    const body=phase?values:method==='PUT'?{...values,durationSeconds:seconds}:undefined;
    busy=true; document.querySelectorAll('button').forEach(b=>b.disabled=true);
    feedback(phase?'Enviando cambio de fase para todo el equipo…':'Enviando orden para '+id.toUpperCase()+'…');
    try {
      const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});
      const data=await r.json();
      if(!r.ok) { log({at:Date.now(),method,path,body,status:r.status,message:data.error||'Petición rechazada'}); feedback(data.error||'Petición rechazada',true); return; }
      const message=phase?'Cambio de fase publicado para todo el equipo.':method==='DELETE'?'Retirada publicada para '+id.toUpperCase()+'.':'Valores publicados para '+id.toUpperCase()+'.';
      feedback(message+(phase?' Comprueba la fase recibida en el campograma.':' Comprueba la telemetría recibida.')); log({at:Date.now(),method,path,body,status:r.status,message:JSON.stringify(data)});
    } catch { feedback('No se pudo confirmar el resultado de la petición. Revisa la conexión y las lecturas antes de repetirla.',true);
      log({at:Date.now(),method,path,body,status:'sin confirmación',message:'Error de conexión o tiempo de espera agotado.'}); }
    finally { busy=false; document.querySelectorAll('button').forEach(b=>b.disabled=false); await refresh(); }
  }
  document.querySelectorAll('[data-temperature]').forEach(b=>b.onclick=()=>send('PUT',{temperature:Number(b.dataset.temperature)}));
  document.querySelectorAll('[data-pulse]').forEach(b=>b.onclick=()=>send('PUT',{pulse:Number(b.dataset.pulse)}));
  $('temperatureForm').onsubmit=e=>{e.preventDefault(); const n=value('temperature'); if(n!==null) send('PUT',{temperature:n});};
  $('pulseForm').onsubmit=e=>{e.preventDefault(); const n=value('pulse'); if(n!==null) send('PUT',{pulse:n});};
  $('both').onclick=()=>{const temperature=value('temperature'),pulse=value('pulse'); if(temperature!==null&&pulse!==null) send('PUT',{temperature,pulse});};
  document.querySelectorAll('[data-phase]').forEach(b=>b.onclick=()=>send('POST',{fase:b.dataset.phase}));
  $('clear').onclick=()=>send('DELETE'); $('refresh').onclick=refresh;
  $('indefinite').onchange=()=>{$('duration').disabled=$('indefinite').checked;};
  function connect() {
    socket=new WebSocket(location.origin.replace(/^http/,'ws'));
    socket.onmessage=e=>{try{const m=JSON.parse(e.data); if(m.tipo==='telemetria'&&Array.isArray(m.jugadores)) m.jugadores.forEach(j=>readings.set(j.jugadorId,j));
      if(m.tipo==='simulador') { if(state) { state.ajustes=m.ajustes||{}; state.fase=m.fase; } } render();}catch{}};
    socket.onclose=()=>{reconnect=setTimeout(connect,3000);}; socket.onerror=()=>socket.close();
  }
  window.addEventListener('pagehide',()=>{clearTimeout(reconnect);socket.onclose=null;socket.close();});
  refresh(); connect(); setInterval(refresh,10000); setInterval(render,1000);
})();
