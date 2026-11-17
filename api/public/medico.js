// Dashboard médico: lee de la API (REST y WebSocket) y escribe con la clave del médico,
// que el médico escribe en la página y solo se guarda en esta pestaña (sessionStorage).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const HISTORIA_MS = 2 * 60 * 1000;   // las gráficas enseñan los últimos 2 minutos: se ve bien el antes y el después
  const SIN_SENAL_MS = 5000;

  let perfiles = [];                   // GET /api/jugadores
  let alertas = [];                    // alertas activas
  const vivos = new Map();             // jugadorId → última telemetría del WebSocket
  const historia = new Map();          // jugadorId → [{t, fc}] de los últimos 5 min
  let seleccionado = 'p1', pauta = null, ultimoTs = 0, socket, reconexion;
  const enviando = new Set();
  // Qué intervención tiene cada alerta (lo mismo que services/intervenciones.js de la API)
  const INTERVENCION = {
    CALOR_AMBAR: 'Enfriar', CALOR_ROJA: 'Enfriar',
    FC_ALTA: 'Reposo', FC_DESACOPLE: 'Reposo', RECUPERACION_LENTA: 'Reposo', INCIDENTE: 'Reposo'
  };
  const marcas = new Map();            // jugadorId → [{t, tipo: 'forzado' | 'medico', texto}] para las gráficas
  let ajustes = {};                    // lo que está forzando la botonera (mensaje 'simulador' del WebSocket)
  const notas = new Map();             // alertaId → nota a medio escribir (sobrevive a los repintados)

  const fmt = (n, d = 1) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('es-ES', { maximumFractionDigits: d }) : '—';
  const hora = ts => new Date(ts).toLocaleTimeString('es-ES');
  const valor = (j, sensor, medida) => j?.sensors?.[sensor]?.[medida]?.value;
  const el = (tag, cls, texto) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; };

  // ---------------------------------------------------------------- acceso del médico
  const guardado = k => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
  const guardar = (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch {} };
  const medico = () => guardado('sh-medico');
  const clave = () => guardado('sh-clave');
  function pintarAcceso() {
    $('doctor').value = medico();
    $('key').value = clave() ? '••••••••' : '';
    pintarBotones();
  }
  // Solo los botones: se llama al repintar las alertas sin tocar lo que se esté escribiendo arriba
  function pintarBotones() {
    const ok = !!(medico() && clave());
    $('accessState').textContent = ok ? 'Confirmará como ' + medico() + '. La clave está guardada solo en esta pestaña.' : 'Sin clave: solo lectura.';
    $('accessState').classList.toggle('ok', ok);
    document.querySelectorAll('.alert button, #guidelineForm button').forEach(b => { b.disabled = !ok || enviando.has(b.dataset.id); });
  }
  $('accessForm').onsubmit = e => {
    e.preventDefault();
    guardar('sh-medico', $('doctor').value.trim());
    if ($('key').value && $('key').value !== '••••••••') guardar('sh-clave', $('key').value);
    pintarAcceso();
  };
  $('logout').onclick = () => { guardar('sh-clave', ''); pintarAcceso(); };

  // Petición con la clave del médico; devuelve {ok, datos} o avisa del error
  async function escribir(metodo, ruta, cuerpo, accion) {
    try {
      const r = await fetch(ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-api-key': clave() }, body: JSON.stringify(cuerpo) });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) {
        const motivo = r.status === 401 || r.status === 403 ? 'la clave no es la del médico' : (datos.error || 'error ' + r.status);
        aviso('No se pudo guardar: ' + motivo, 'error');
        return { ok: false };
      }
      aviso(accion);
      return { ok: true, datos };
    } catch {
      aviso('No se pudo conectar con la API', 'error');
      return { ok: false };
    }
  }

  function aviso(texto, tipo = '') {
    const t = el('div', 'toast ' + tipo, texto);
    $('toasts').prepend(t);
    setTimeout(() => t.remove(), tipo === 'critica' ? 9000 : 5000);
  }

  // ---------------------------------------------------------------- equipo
  const alertasDe = id => alertas.filter(a => a.jugadorId === id);
  function semaforo(id) {
    const j = vivos.get(id);
    if (!j || j.estado === 'sin_senal' || Date.now() - Date.parse(j.ts) > SIN_SENAL_MS) return 'gris';
    const suyas = alertasDe(id);
    return suyas.some(a => a.severidad === 'critica') ? 'rojo' : suyas.length ? 'ambar' : 'verde';
  }
  function pintarEquipo() {
    const frag = document.createDocumentFragment();
    for (const p of perfiles) {
      const j = vivos.get(p.id), color = semaforo(p.id), suyas = alertasDe(p.id);
      const b = el('button', 'player ' + color + (p.id === seleccionado ? ' sel' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(p.id === seleccionado));
      b.onclick = () => seleccionar(p.id);
      const top = el('div', 'top');
      top.append(el('span', 'num', String(p.dorsal)), el('span', 'pos', p.posicion + ' · ' + p.id.toUpperCase()));
      if (p.enReadaptacion) top.append(el('span', 'tag', 'readapt.'));
      const vals = el('div', 'vals');
      if (color === 'gris') vals.append(el('span', '', 'Sin señal del wearable'));
      else {
        const pct = j?.derivados?.pctFcMax;
        for (const [v, u] of [[fmt(valor(j, 'pulsemeter', 'pulse'), 0), 'lpm' + (pct != null ? ' · ' + Math.round(pct) + ' %' : '')],
          [fmt(valor(j, 'thermometer', 'temperature')), '°C'], [fmt(valor(j, 'gps', 'speed')), 'km/h']]) {
          const s = el('span'); s.append(el('b', '', v), document.createTextNode(u)); vals.append(s);
        }
      }
      b.append(top, vals, el('div', 'foot', suyas.length ? suyas.map(a => a.codigo).join(' · ') : 'Sin alertas'));
      frag.append(b);
    }
    $('team').replaceChildren(frag);
    const conSenal = perfiles.filter(p => semaforo(p.id) !== 'gris').length;
    $('teamCount').textContent = conSenal + ' / ' + perfiles.length + ' con señal';
  }

  // ---------------------------------------------------------------- alertas
  function pintarAlertas() {
    $('alertCount').textContent = alertas.length;
    if (!alertas.length) { $('alerts').replaceChildren(el('p', 'hint', 'No hay alertas activas.')); return; }
    const frag = document.createDocumentFragment();
    for (const a of alertas) {
      const enTratamiento = a.intervencion && !a.intervencion.fin;
      const fila = el('div', 'alert ' + a.severidad + (enTratamiento ? ' tratando' : ''));
      const txt = el('div', 'txt');
      txt.append(el('strong', '', a.jugadorId.toUpperCase() + ' · ' + a.codigo), el('span', 'time', hora(a.ts)), el('span', 'msg', a.mensaje));
      const acciones = el('div', 'acts');
      if (enTratamiento) {
        const iv = a.intervencion, j = vivos.get(a.jugadorId);
        const ahora = iv.unidad === '°C' ? valor(j, 'thermometer', 'temperature') : valor(j, 'pulsemeter', 'pulse');
        txt.append(el('span', 'treat', 'En tratamiento · ' + iv.nombre + ': ' + fmt(iv.desde) + ' → ' + fmt(iv.objetivo) + ' ' + iv.unidad +
          (ahora != null ? ' · ahora ' + fmt(ahora) + ' ' + iv.unidad : '') + '. La alerta se cerrará sola al llegar.'));
      } else {
        const nota = el('input'); nota.placeholder = 'Nota (opcional)'; nota.maxLength = 300;
        nota.value = notas.get(a.id) || '';
        nota.oninput = () => notas.set(a.id, nota.value);
        txt.append(nota);
        if (INTERVENCION[a.codigo]) {
          const iv = el('button', 'treat-btn', enviando.has(a.id) ? 'Enviando…' : INTERVENCION[a.codigo]);
          iv.type = 'button'; iv.dataset.id = a.id;
          iv.title = INTERVENCION[a.codigo] === 'Enfriar' ? 'Baja la temperatura poco a poco hasta 37,5 °C y cierra la alerta' : 'Baja el pulso poco a poco hasta 85 lpm y cierra la alerta';
          iv.onclick = () => intervenir(a);
          acciones.append(iv);
        }
        const b = el('button', '', enviando.has(a.id) ? 'Enviando…' : 'Confirmar');
        b.type = 'button'; b.dataset.id = a.id;
        b.onclick = () => confirmar(a, nota.value.trim());
        acciones.append(b);
      }
      fila.append(txt, acciones);
      frag.append(fila);
    }
    $('alerts').replaceChildren(frag);
    pintarBotones();
  }
  async function cargarAlertas() {
    try {
      const r = await fetch('/api/alertas?estado=activa', { cache: 'no-store' });
      if (!r.ok) return;
      const peso = a => a.severidad === 'critica' ? 0 : 1;
      alertas = (await r.json()).sort((a, b) => peso(a) - peso(b) || Date.parse(b.ts) - Date.parse(a.ts));
      pintarAlertas(); pintarEquipo(); pintarFicha();
    } catch {}
  }
  async function confirmar(a, nota) {
    enviando.add(a.id); pintarAlertas();
    const cuerpo = { por: medico() };
    if (nota) cuerpo.nota = nota;
    await escribir('POST', '/api/alertas/' + encodeURIComponent(a.id) + '/confirmar', cuerpo, 'Alerta confirmada: ' + a.jugadorId.toUpperCase() + ' · ' + a.codigo);
    enviando.delete(a.id);
    notas.delete(a.id);
    await cargarAlertas();
  }

  async function intervenir(a) {
    enviando.add(a.id); pintarAlertas();
    const r = await escribir('POST', '/api/alertas/' + encodeURIComponent(a.id) + '/intervenir', { por: medico() },
      INTERVENCION[a.codigo] + ' a ' + a.jugadorId.toUpperCase() + ': el valor irá bajando y la alerta se cerrará sola');
    enviando.delete(a.id);
    if (r.ok && seleccionado !== a.jugadorId) seleccionar(a.jugadorId);
    await cargarAlertas();
  }
  function marcar(jugadorId, tipo, texto, t = Date.now()) {
    const m = marcas.get(jugadorId) || [];
    m.push({ t, tipo, texto });
    marcas.set(jugadorId, m.filter(x => Date.now() - x.t <= HISTORIA_MS));
  }

  // ---------------------------------------------------------------- jugador seleccionado
  function seleccionar(id) {
    seleccionado = id; pauta = null;
    pintarEquipo(); pintarFicha(); cargarPauta(); cargarHistorico(id);
  }
  // Rellena la gráfica con los resúmenes de 10 s que guarda la API (media de FC), para no empezar en blanco
  async function cargarHistorico(id) {
    try {
      const desde = new Date(Date.now() - HISTORIA_MS).toISOString();
      const r = await fetch('/api/jugadores/' + id + '/historico?desde=' + encodeURIComponent(desde), { cache: 'no-store' });
      if (!r.ok) return;
      const vivosJ = historia.get(id) || [];
      const primero = vivosJ.length ? vivosJ[0].t : Infinity;
      const previos = (await r.json()).filter(l => typeof l.fcMedia === 'number')
        .map(l => ({ t: Date.parse(l.ts) + 5000, fc: l.fcMedia, temp: l.temp })).filter(p => p.t < primero);
      historia.set(id, previos.concat(vivosJ));
      if (id === seleccionado) pintarGraficas();
    } catch {}
  }
  function medidor(barra, v, min, max) {
    $(barra).style.left = v == null ? '0' : 'calc(' + Math.max(0, Math.min(100, (v - min) / (max - min) * 100)) + '% - 2px)';
  }
  function pintarFicha() {
    const p = perfiles.find(x => x.id === seleccionado);
    if (!p) return;
    const j = vivos.get(seleccionado), color = semaforo(seleccionado);
    $('playerTitle').textContent = p.id.toUpperCase() + ' · dorsal ' + p.dorsal + ' · ' + p.posicion;
    const d = j?.derivados || {};
    $('playerInfo').textContent = color === 'gris' ? 'Sin señal del wearable.' :
      'FCmáx ' + p.fcMax + ' lpm · zona FC ' + (d.zonaFc ?? '—') + ' · velocidad: ' + (d.zonaVelocidad ?? '—') + ' · asimetría ' + fmt(d.asimetria) + ' pts';
    $('playerAlerts').replaceChildren(...alertasDe(seleccionado).map(a => el('span', 'chip ' + a.severidad, a.codigo)));
    const pct = color === 'gris' ? null : d.pctFcMax, temp = color === 'gris' ? null : valor(j, 'thermometer', 'temperature');
    $('pctValue').textContent = pct == null ? '—' : Math.round(pct) + ' %';
    $('tempValue').textContent = temp == null ? '—' : fmt(temp) + ' °C';
    medidor('pctBar', pct, 50, 100);
    medidor('tempBar', temp, 36, 41);
    $('guidelinePlayer').textContent = p.id.toUpperCase();
    pintarGraficas();
  }
  function pintarGraficas() {
    const p = perfiles.find(x => x.id === seleccionado);
    const fcMax = p?.fcMax || 190;
    grafica('hrChart', 'hrNow', 'fc', 40, 210, [60, 90, 120, 150, 180], [[Math.round(fcMax * .85), 'aviso'], [Math.round(fcMax * .92), 'alerta']], 'lpm', 0);
    grafica('tempChart', 'tempNow', 'temp', 36, 41.5, [37, 38, 39, 40, 41], [[39, 'aviso'], [40, 'alerta']], '°C', 1);
  }
  function grafica(svgId, etiquetaId, campo, MIN, MAX, rejilla, umbrales, unidad, dec) {
    const svg = $(svgId), W = 600, H = 200, ahora = Date.now();
    const y = v => H - (Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN) * H;
    const x = tt => (tt - (ahora - HISTORIA_MS)) / HISTORIA_MS * W;
    const ns = 'http://www.w3.org/2000/svg', partes = [];
    const nodo = (tag, attrs, texto) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (texto != null) n.textContent = texto; partes.push(n); };
    for (const v of rejilla) { nodo('line', { x1: 0, x2: W, y1: y(v), y2: y(v), class: 'grid-line' }); nodo('text', { x: 6, y: y(v) - 4, class: 'axis' }, String(v)); }
    for (const [v, tipo] of umbrales) nodo('line', { x1: 0, x2: W, y1: y(v), y2: y(v), class: 'umbral ' + tipo });
    for (const [xx, texto, ancla] of [[6, '−2 min', 'start'], [W / 2, '−1 min', 'middle'], [W - 6, 'ahora', 'end']]) nodo('text', { x: xx, y: H - 6, class: 'axis', 'text-anchor': ancla }, texto);
    for (const m of marcas.get(seleccionado) || []) {
      if (ahora - m.t > HISTORIA_MS) continue;
      nodo('line', { x1: x(m.t), x2: x(m.t), y1: 0, y2: H, class: 'marca ' + m.tipo });
      nodo('text', { x: x(m.t) + 4, y: m.tipo === 'medico' ? 30 : 14, class: 'marca-txt ' + m.tipo }, m.texto);
    }
    const puntos = (historia.get(seleccionado) || []).filter(q => ahora - q.t <= HISTORIA_MS && typeof q[campo] === 'number');
    if (puntos.length > 1) nodo('polyline', { class: 'line ' + campo, points: puntos.map(q => x(q.t).toFixed(1) + ',' + y(q[campo]).toFixed(1)).join(' ') });
    svg.replaceChildren(...partes);
    const ultimo = puntos[puntos.length - 1];
    $(etiquetaId).textContent = ultimo ? fmt(ultimo[campo], dec) + ' ' + unidad + ' · ' + hora(ultimo.t) : 'Sin datos todavía';
  }

  // ---------------------------------------------------------------- pauta de readaptación
  async function cargarPauta() {
    const id = seleccionado;
    try {
      const r = await fetch('/api/jugadores/' + id + '/pauta', { cache: 'no-store' });
      if (id !== seleccionado) return;
      pauta = r.ok ? await r.json() : null;
    } catch { pauta = null; }
    const lim = [];
    if (pauta) {
      if (pauta.velMax != null) lim.push('velocidad ≤ ' + fmt(pauta.velMax) + ' km/h');
      if (pauta.cargaMax != null) lim.push('carga ≤ ' + fmt(pauta.cargaMax, 0) + ' m de alta intensidad');
      if (pauta.asimetriaMax != null) lim.push('asimetría ≤ ' + fmt(pauta.asimetriaMax) + ' pts');
    }
    $('guidelineNow').textContent = pauta
      ? 'Activa: ' + lim.join(' · ') + ' — hasta el ' + new Date(pauta.hasta).toLocaleDateString('es-ES') + (pauta.notas ? ' (' + pauta.notas + ')' : '')
      : id.toUpperCase() + ' no tiene ninguna pauta activa.';
  }
  $('guidelineForm').onsubmit = async e => {
    e.preventDefault();
    const cuerpo = {};
    for (const k of ['velMax', 'cargaMax', 'asimetriaMax']) if ($(k).value !== '') cuerpo[k] = Number($(k).value);
    if (!Object.keys(cuerpo).length) { aviso('Indica al menos un límite: velocidad, carga o asimetría', 'error'); return; }
    cuerpo.hasta = new Date($('hasta').value + 'T23:59:59').toISOString();   // vale hasta el final de ese día
    if ($('notas').value.trim()) cuerpo.notas = $('notas').value.trim();
    const id = seleccionado;
    const r = await escribir('POST', '/api/jugadores/' + id + '/pauta', cuerpo, 'Pauta creada para ' + id.toUpperCase());
    if (r.ok) { $('guidelineForm').reset(); await cargarPerfiles(); cargarPauta(); }
  };

  // ---------------------------------------------------------------- datos de la API
  async function cargarPerfiles() {
    try {
      const r = await fetch('/api/jugadores', { cache: 'no-store' });
      if (r.ok) perfiles = await r.json();
      pintarEquipo(); pintarFicha();
    } catch {}
  }
  function conectar() {
    socket = new WebSocket(location.origin.replace(/^http/, 'ws'));
    socket.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.tipo === 'telemetria' && Array.isArray(m.jugadores)) {
        ultimoTs = Date.now();
        for (const j of m.jugadores) {
          vivos.set(j.jugadorId, j);
          const fc = valor(j, 'pulsemeter', 'pulse'), temp = valor(j, 'thermometer', 'temperature');
          if (j.estado === 'ok' && typeof fc === 'number') {
            const h = historia.get(j.jugadorId) || [];
            const t = Date.parse(j.ts);
            if (!h.length || h[h.length - 1].t < t) h.push({ t, fc, temp });
            while (h.length && Date.now() - h[0].t > HISTORIA_MS) h.shift();
            historia.set(j.jugadorId, h);
          }
        }
        pintarEquipo(); pintarFicha(); if (alertas.some(a => a.intervencion && !a.intervencion.fin)) pintarAlertas();
      } else if (m.tipo === 'alerta' && m.alerta) {
        const a = m.alerta;
        aviso((a.severidad === 'critica' ? 'ALERTA CRÍTICA · ' : 'Nueva alerta · ') + a.jugadorId.toUpperCase() + ' · ' + a.codigo + ': ' + a.mensaje, a.severidad);
        cargarAlertas();
      } else if (m.tipo === 'intervencion' && m.alerta) {
        const a = m.alerta;
        marcar(a.jugadorId, 'medico', 'médico: ' + (a.intervencion.tipo === 'enfriar' ? 'enfriar' : 'reposo'), Date.parse(a.intervencion.inicio));
        aviso('Intervención en curso · ' + a.jugadorId.toUpperCase() + ' · ' + a.intervencion.nombre, 'medico');
        cargarAlertas();
      } else if (m.tipo === 'alerta_confirmada') {
        const a = alertas.find(x => x.id === m.alertaId);
        if (a && a.intervencion) aviso(a.jugadorId.toUpperCase() + ' · ' + a.codigo + ' tratada: ' + (a.intervencion.unidad === '°C' ? 'temperatura' : 'pulso') + ' normalizado, alerta cerrada', 'medico');
        cargarAlertas();
      } else if (m.tipo === 'simulador') {
        // Lo que se fuerza desde la botonera queda marcado en las gráficas, para distinguirlo de lo que hace el médico
        const nuevos = m.ajustes || {};
        for (const [id, aj] of Object.entries(nuevos)) {
          const antes = ajustes[id];
          if (aj.origen !== 'medico' && (!antes || antes.temperature !== aj.temperature || antes.pulse !== aj.pulse)) {
            marcar(id, 'forzado', 'forzado: ' + [aj.temperature != null ? fmt(aj.temperature) + ' °C' : null, aj.pulse != null ? aj.pulse + ' lpm' : null].filter(Boolean).join(' · '));
          }
        }
        ajustes = nuevos;
      }
    };
    socket.onclose = () => { reconexion = setTimeout(conectar, 3000); };
    socket.onerror = () => socket.close();
  }
  function pintarConexion() {
    const enDirecto = Date.now() - ultimoTs < SIN_SENAL_MS;
    $('connection').textContent = enDirecto ? 'API · en directo' : 'Esperando telemetría';
    $('connection').classList.toggle('online', enDirecto);
  }
  window.addEventListener('pagehide', () => { clearTimeout(reconexion); if (socket) { socket.onclose = null; socket.close(); } });

  pintarAcceso();
  cargarPerfiles().then(() => { cargarPauta(); cargarHistorico(seleccionado); });
  cargarAlertas();
  conectar();
  setInterval(cargarAlertas, 30000);          // por si se confirma una alerta desde otro sitio (Swagger, Postman)
  setInterval(() => { pintarConexion(); pintarGraficas(); }, 1000);
})();
