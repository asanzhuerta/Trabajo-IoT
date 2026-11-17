// Dashboard médico: lee de la API (REST y WebSocket) y escribe con la clave del médico,
// que el médico escribe en la página y solo se guarda en esta pestaña (sessionStorage).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const HISTORIA_MS = 5 * 60 * 1000;   // la gráfica enseña los últimos 5 minutos
  const SIN_SENAL_MS = 5000;

  let perfiles = [];                   // GET /api/jugadores
  let alertas = [];                    // alertas activas
  const vivos = new Map();             // jugadorId → última telemetría del WebSocket
  const historia = new Map();          // jugadorId → [{t, fc}] de los últimos 5 min
  let seleccionado = 'p1', pauta = null, ultimoTs = 0, socket, reconexion;
  const enviando = new Set();
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
      const fila = el('div', 'alert ' + a.severidad);
      const txt = el('div', 'txt');
      txt.append(el('strong', '', a.jugadorId.toUpperCase() + ' · ' + a.codigo), el('span', 'time', hora(a.ts)), el('span', 'msg', a.mensaje));
      const nota = el('input'); nota.placeholder = 'Nota (opcional)'; nota.maxLength = 300;
      nota.value = notas.get(a.id) || '';
      nota.oninput = () => notas.set(a.id, nota.value);
      txt.append(nota);
      const b = el('button', '', enviando.has(a.id) ? 'Enviando…' : 'Confirmar');
      b.type = 'button'; b.dataset.id = a.id;
      b.onclick = () => confirmar(a, nota.value.trim());
      fila.append(txt, b);
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
        .map(l => ({ t: Date.parse(l.ts) + 5000, fc: l.fcMedia })).filter(p => p.t < primero);
      historia.set(id, previos.concat(vivosJ));
      if (id === seleccionado) pintarGrafica();
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
    pintarGrafica();
  }
  function pintarGrafica() {
    const svg = $('hrChart'), W = 600, H = 200, MIN = 40, MAX = 210, ahora = Date.now();
    const y = v => H - (v - MIN) / (MAX - MIN) * H;
    const ns = 'http://www.w3.org/2000/svg', partes = [];
    for (const v of [60, 90, 120, 150, 180]) {
      const l = document.createElementNS(ns, 'line');
      Object.entries({ x1: 0, x2: W, y1: y(v), y2: y(v), class: 'grid-line' }).forEach(([k, val]) => l.setAttribute(k, val));
      const t = document.createElementNS(ns, 'text');
      Object.entries({ x: 6, y: y(v) - 4, class: 'axis' }).forEach(([k, val]) => t.setAttribute(k, val));
      t.textContent = v;
      partes.push(l, t);
    }
    for (const [x, texto, ancla] of [[6, '−5 min', 'start'], [W / 2, '−2,5 min', 'middle'], [W - 6, 'ahora', 'end']]) {
      const t = document.createElementNS(ns, 'text');
      Object.entries({ x, y: H - 6, class: 'axis', 'text-anchor': ancla }).forEach(([k, val]) => t.setAttribute(k, val));
      t.textContent = texto;
      partes.push(t);
    }
    const puntos = (historia.get(seleccionado) || []).filter(p => ahora - p.t <= HISTORIA_MS);
    if (puntos.length > 1) {
      const linea = document.createElementNS(ns, 'polyline');
      linea.setAttribute('class', 'line');
      linea.setAttribute('points', puntos.map(p => ((p.t - (ahora - HISTORIA_MS)) / HISTORIA_MS * W).toFixed(1) + ',' + y(Math.max(MIN, Math.min(MAX, p.fc))).toFixed(1)).join(' '));
      partes.push(linea);
    }
    svg.replaceChildren(...partes);
    const ultimo = puntos[puntos.length - 1];
    $('hrNow').textContent = ultimo ? ultimo.fc + ' lpm · ' + hora(ultimo.t) : 'Sin datos todavía';
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
          const fc = valor(j, 'pulsemeter', 'pulse');
          if (j.estado === 'ok' && typeof fc === 'number') {
            const h = historia.get(j.jugadorId) || [];
            const t = Date.parse(j.ts);
            if (!h.length || h[h.length - 1].t < t) h.push({ t, fc });
            while (h.length && Date.now() - h[0].t > HISTORIA_MS) h.shift();
            historia.set(j.jugadorId, h);
          }
        }
        pintarEquipo(); pintarFicha();
      } else if (m.tipo === 'alerta' && m.alerta) {
        const a = m.alerta;
        aviso((a.severidad === 'critica' ? 'ALERTA CRÍTICA · ' : 'Nueva alerta · ') + a.jugadorId.toUpperCase() + ' · ' + a.codigo + ': ' + a.mensaje, a.severidad);
        cargarAlertas();
      } else if (m.tipo === 'alerta_confirmada') cargarAlertas();
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
  setInterval(() => { pintarConexion(); pintarGrafica(); }, 1000);
})();
