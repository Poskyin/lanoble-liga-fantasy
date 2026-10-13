// La Noble Liga Fantasy: pinta la web a partir de /api/datos (hojas de Google)
// y, si falla, de la copia guardada en /data/respaldo.json.

const MIEMBROS = [
  { n: 1, nombre: 'Alejandro Antequera', corto: 'Alejandro', usuario: 'MrPipita20', color: 'var(--m1)', hex: '#3987e5' },
  { n: 2, nombre: 'Daniel Almagro', corto: 'Daniel', usuario: 'Dani88', color: 'var(--m2)', hex: '#d95926' },
  { n: 3, nombre: 'Ferxo', completo: 'Fernando Sánchez López de Rueda', corto: 'Ferxo', usuario: 'Fer2201', color: 'var(--m3)', hex: '#199e70' },
  { n: 4, nombre: 'Gabriel Tarcaya', alias: 'Real Poskyin Balompié', corto: 'Gabriel', usuario: 'Poskyin_RPB', color: 'var(--m4)', hex: '#c98500' },
  { n: 5, nombre: 'Nicolás Figueroa', corto: 'Nicolás', usuario: 'nikiscossj', color: 'var(--m5)', hex: '#d55181' },
];
const PRIMERA_VUELTA = 19;

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const euros = v => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: v % 1 ? 2 : 0 }).format(v);
const millones = v => `${nf.format(v)} M€`;

function buscarMiembro(nombre) {
  const k = norm(nombre);
  if (!k) return null;
  return MIEMBROS.find(m => [m.nombre, m.completo, m.alias, m.corto, m.usuario].some(v => v && norm(v) === k))
    || MIEMBROS.find(m => k.startsWith(norm(m.corto)) || norm(m.nombre).startsWith(k))
    || null;
}

// ---------- Fechas (todas las de las hojas están en hora de Madrid) ----------
function desfaseMadrid(ms) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const g = t => +p.find(x => x.type === t).value;
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
}
function deMadrid(iso) {
  if (!iso) return null;
  const [d, t = '00:00:00'] = iso.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h = 0, mi = 0, s = 0] = t.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi, s);
  return new Date(guess - desfaseMadrid(guess));
}
const fFecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' });
const fFechaHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fCierre = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
const fHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const limpiar = s => s.replace(/\./g, '');

// ---------- Carga ----------
async function getJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function cargar() {
  const [respaldo, calendario] = await Promise.all([getJson('/data/respaldo.json'), getJson('/data/calendario.json')]);
  let vivo = null;
  try { vivo = await getJson('/api/datos'); } catch { /* sin servidor: usamos la copia */ }
  const datos = { calendario, fuentes: {} };
  for (const k of ['jornadas', 'clausulazos', 'periodos', 'sanciones', 'pagos']) {
    // las listas que pueden estar vacías de verdad (sanciones, pagos) se aceptan vacías si la hoja se leyó bien
    const leida = vivo && Array.isArray(vivo[k]) && vivo.fuentes?.[k] === 'hoja';
    const vale = leida && (vivo[k].length || ['sanciones', 'pagos'].includes(k));
    if (vale) { datos[k] = vivo[k]; datos.fuentes[k] = 'hoja'; }
    else { datos[k] = respaldo[k] || []; datos.fuentes[k] = 'copia'; }
  }
  datos.copiaDe = respaldo.copiaDe;
  datos.actualizado = vivo?.actualizado;
  return datos;
}

// ---------- Cálculos de la clasificación ----------
function calcular(jornadas) {
  const filas = jornadas.map(f => ({ ...f, m: buscarMiembro(f.usuario) })).filter(f => f.m);
  const numeros = [...new Set(filas.map(f => f.jornada))].sort((a, b) => a - b);
  const ultima = numeros.at(-1) || 0;
  const porJornada = new Map(numeros.map(j => [j, filas.filter(f => f.jornada === j).sort((a, b) => a.posicion - b.posicion)]));
  const provisionales = new Set(filas.filter(f => f.provisional).map(f => f.jornada));

  const acum = new Map(MIEMBROS.map(m => [m.n, 0]));
  const historia = []; // por jornada: [{m, total, rank, puntos}]
  for (const j of numeros) {
    for (const f of porJornada.get(j)) acum.set(f.m.n, acum.get(f.m.n) + f.puntos);
    const orden = MIEMBROS.map(m => ({ m, total: acum.get(m.n), puntos: porJornada.get(j).find(f => f.m.n === m.n)?.puntos ?? null }))
      .sort((a, b) => b.total - a.total || a.m.n - b.m.n);
    orden.forEach((o, i) => { o.rank = i + 1; });
    historia.push({ j, orden });
  }

  // Multas automáticas: último 1 €, penúltimo 0,50 €; quien no puntúa paga además 1 € (alineación indebida).
  const stats = new Map(MIEMBROS.map(m => [m.n, { m, ganadas: 0, ultimo: 0, penultimo: 0, clasificacion: 0, noPuntua: 0, jugadas: 0 }]));
  const indebidas = [];
  for (const j of numeros) {
    const lista = porJornada.get(j);
    const maxPos = Math.max(...lista.map(f => f.posicion));
    // En las jornadas provisionales todavía no se cobra nada: la multa queda pendiente.
    const cobra = !provisionales.has(j);
    for (const f of lista) {
      const s = stats.get(f.m.n);
      s.jugadas++;
      f.multa = 0;
      f.pendiente = !cobra;
      if (f.posicion === 1) s.ganadas++;
      if (f.posicion === maxPos) f.multa += 1;
      else if (f.posicion === maxPos - 1) f.multa += 0.5;
      if (f.puntos === 0) { f.multa += 1; f.noPuntua = true; }
      if (!cobra) continue;
      if (f.posicion === maxPos) { s.ultimo++; s.clasificacion += 1; }
      else if (f.posicion === maxPos - 1) { s.penultimo++; s.clasificacion += 0.5; }
      if (f.noPuntua) {
        s.noPuntua += 1;
        indebidas.push({ jornada: j, m: f.m, concepto: `No puntuó en la jornada ${j} (alineación indebida)`, importe: 1 });
      }
    }
  }
  return { numeros, ultima, porJornada, provisionales, historia, stats, indebidas };
}

// ---------- Portada ----------
function pintarPortada(c, datos, ventana) {
  const fin = c.historia.at(-1);
  if (!fin) { $('#parte').textContent = 'Aún no hay jornadas registradas.'; return; }
  const [a, b] = fin.orden;
  const dif = a.total - b.total;
  $('#parte').innerHTML = dif === 0
    ? `Tras la jornada ${c.ultima}, <strong>${esc(a.m.nombre)}</strong> y <strong>${esc(b.m.nombre)}</strong> comparten el liderato con ${a.total} puntos.`
    : `Tras la jornada ${c.ultima}, manda <strong>${esc(a.m.nombre)}</strong> con ${a.total} puntos, ${dif} más que ${esc(b.m.nombre)}.`;

  const cal = datos.calendario;
  const prox = cal.find(x => x.jornada === c.ultima + 1);
  const invierno = cal.find(x => x.jornada === PRIMERA_VUELTA);
  const items = [];
  if (prox) items.push(['Próxima jornada', `Jornada ${prox.jornada}, ${prox.fechas}`]);
  if (ventana) items.push([`Clausulazos, ${ventana.periodo.toLowerCase()}`, `Cierra el ${limpiar(fCierre.format(ventana.finD))}, ${fHora.format(ventana.finD)}`]);
  if (invierno && c.ultima < PRIMERA_VUELTA) items.push(['Campeón de invierno', `Se decide en la jornada ${PRIMERA_VUELTA} (${invierno.fechas})`]);
  $('#avisos').innerHTML = items.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('');
}

const celdaManager = (m, extra = '') => `
  <span class="manager">
    <span class="manager-chapa" style="background:${m.color}"></span>
    <span><span class="manager-nombre">${esc(m.nombre)}${extra}</span><span class="manager-usuario">${esc(m.usuario)}</span></span>
  </span>`;

// ---------- Clasificación general ----------
function pintarGeneral(c) {
  const fin = c.historia.at(-1);
  const previa = c.historia.at(-2);
  if (!fin) return;
  const lider = fin.orden[0].total;
  $('#nota-provisional').textContent = c.provisionales.size
    ? `Las jornadas ${[...c.provisionales].join(' y ')} aún pueden cambiar: hay partidos aplazados.`
    : `Tras ${c.ultima} jornadas.`;

  $('#tabla-general tbody').innerHTML = fin.orden.map(o => {
    const s = c.stats.get(o.m.n);
    let mov = '';
    if (previa) {
      const antes = previa.orden.find(p => p.m.n === o.m.n).rank;
      if (antes > o.rank) mov = `<span class="movimiento sube" title="Sube ${antes - o.rank}">▲${antes - o.rank}</span>`;
      if (antes < o.rank) mov = `<span class="movimiento baja" title="Baja ${o.rank - antes}">▼${o.rank - antes}</span>`;
    }
    const ultimas = c.numeros.slice(-5).map(j => {
      const f = c.porJornada.get(j).find(x => x.m.n === o.m.n);
      if (!f) return '<span>–</span>';
      const n = c.porJornada.get(j).length;
      const cls = [f.posicion === 1 ? 'p1' : '', f.posicion === n ? 'p5' : '', c.provisionales.has(j) ? 'prov' : ''].join(' ');
      return `<span class="${cls}" title="Jornada ${j}: ${f.posicion}.º con ${f.puntos} puntos${c.provisionales.has(j) ? ' (provisional)' : ''}">${f.posicion}</span>`;
    }).join('');
    const media = s.jugadas ? o.total / s.jugadas : 0;
    return `<tr>
      <td class="pos num">${o.rank}${mov}</td>
      <td>${celdaManager(o.m)}</td>
      <td class="num puntos">${o.total}</td>
      <td class="num ocultable">${nf.format(media)}</td>
      <td class="num">${s.ganadas}</td>
      <td class="ocultable"><span class="racha" aria-label="Puestos en las últimas jornadas">${ultimas}</span></td>
      <td class="num ocultable">${o.total === lider ? '–' : `−${lider - o.total}`}</td>
    </tr>`;
  }).join('');
}

// ---------- Gráfico de evolución (puesto en la general) ----------
function pintarEvolucion(c) {
  const lienzo = $('#lienzo');
  const H = c.historia;
  if (H.length < 2) { $('#grafico-evolucion').hidden = true; return; }
  $('#leyenda').innerHTML = MIEMBROS.map(m => `<span><i style="background:${m.color}"></i>${esc(m.nombre)}</span>`).join('');

  const N = MIEMBROS.length;
  const W = Math.max(320, Math.min(900, Math.round(lienzo.clientWidth || 760)));
  const estrecho = W < 560;
  const Ht = estrecho ? 250 : 300, m = { t: 18, r: estrecho ? 92 : 132, b: 36, l: 36 };
  const x = i => m.l + i * (W - m.l - m.r) / (H.length - 1);
  const y = r => m.t + (r - 1) * (Ht - m.t - m.b) / (N - 1);
  const rankDe = (h, n) => h.orden.find(o => o.m.n === n);

  let s = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Puesto de cada mánager en la general tras cada jornada">`;
  for (let r = 1; r <= N; r++) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(r)}" y2="${y(r)}" stroke="#2b3d63" stroke-width="1" stroke-dasharray="2 4"/>`;
    s += `<text x="${m.l - 12}" y="${y(r) + 5}" text-anchor="end" font-size="13">${r}.º</text>`;
  }
  H.forEach((h, i) => {
    const prov = c.provisionales.has(h.j);
    s += `<text x="${x(i)}" y="${Ht - 10}" text-anchor="middle" font-size="13"${prov ? ' font-style="italic"' : ''}>J${h.j}${prov ? '*' : ''}</text>`;
  });
  s += `<line id="cruz" x1="0" x2="0" y1="${m.t - 8}" y2="${Ht - m.b + 6}" stroke="#e6d197" stroke-width="1" opacity="0"/>`;
  // líneas: primero las de abajo para que el líder quede encima
  const finales = H.at(-1).orden.slice().reverse();
  for (const o of finales) {
    const pts = H.map((h, i) => `${x(i)},${y(rankDe(h, o.m.n).rank)}`);
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${o.m.hex}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    H.forEach((h, i) => {
      s += `<circle cx="${x(i)}" cy="${y(rankDe(h, o.m.n).rank)}" r="4.5" fill="${o.m.hex}" stroke="#131d31" stroke-width="2"/>`;
    });
    s += `<text x="${x(H.length - 1) + 10}" y="${y(o.rank) + 5}" font-size="14" style="fill:var(--texto)">${esc(o.m.corto)}${estrecho ? '' : ` <tspan style="fill:var(--texto-3)">${o.total}</tspan>`}</text>`;
  }
  s += `<rect id="zona" x="${m.l - 10}" y="0" width="${W - m.l - m.r + 20}" height="${Ht}" fill="transparent" tabindex="0" aria-label="Recorre las jornadas con las flechas"/>`;
  s += '</svg>';
  lienzo.innerHTML = s;

  const svg = lienzo.querySelector('svg');
  const cruz = svg.querySelector('#cruz');
  const zona = svg.querySelector('#zona');
  const tip = $('#tooltip');
  let actual = H.length - 1;

  const mostrar = (i, cx, cy) => {
    actual = i;
    const h = H[i];
    cruz.setAttribute('x1', x(i)); cruz.setAttribute('x2', x(i)); cruz.setAttribute('opacity', '.6');
    tip.innerHTML = `<strong>Jornada ${h.j}${c.provisionales.has(h.j) ? ' (provisional)' : ''}</strong><ol>` +
      h.orden.map(o => `<li><i style="background:${o.m.hex}"></i>${o.rank}.º ${esc(o.m.corto)}<b>${o.total}</b></li>`).join('') +
      '</ol><span class="nota">Puntos acumulados en la general</span>';
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = cx + 16, top = cy - r.height / 2;
    if (left + r.width > window.innerWidth - 8) left = cx - r.width - 16;
    top = Math.max(8, Math.min(top, window.innerHeight - r.height - 8));
    tip.style.left = `${Math.max(8, left)}px`; tip.style.top = `${top}px`;
  };
  const ocultar = () => { tip.hidden = true; cruz.setAttribute('opacity', '0'); };
  const indice = ev => {
    const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    const loc = p.matrixTransform(svg.getScreenCTM().inverse());
    return Math.max(0, Math.min(H.length - 1, Math.round((loc.x - m.l) / ((W - m.l - m.r) / (H.length - 1)))));
  };
  zona.addEventListener('pointermove', ev => mostrar(indice(ev), ev.clientX, ev.clientY));
  zona.addEventListener('pointerdown', ev => mostrar(indice(ev), ev.clientX, ev.clientY));
  zona.addEventListener('pointerleave', ocultar);
  window.onscroll = ocultar;
  const enTeclado = () => {
    const pt = svg.createSVGPoint(); pt.x = x(actual); pt.y = m.t;
    const sc = pt.matrixTransform(svg.getScreenCTM());
    mostrar(actual, sc.x, sc.y + 60);
  };
  zona.addEventListener('focus', enTeclado);
  zona.addEventListener('blur', ocultar);
  zona.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowLeft') { actual = Math.max(0, actual - 1); enTeclado(); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { actual = Math.min(H.length - 1, actual + 1); enTeclado(); ev.preventDefault(); }
  });
}

// ---------- Jornadas ----------
function pintarJornadas(c, calendario) {
  const sel = $('#selector-jornada');
  sel.innerHTML = c.numeros.map(j =>
    `<button type="button" role="tab" data-j="${j}" class="${c.provisionales.has(j) ? 'prov' : ''}" aria-selected="false" title="Jornada ${j}${c.provisionales.has(j) ? ' (provisional)' : ''}">J${j}</button>`).join('');
  const mostrar = j => {
    sel.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.j === j)));
    const lista = c.porJornada.get(j);
    const n = lista.length;
    const cal = calendario.find(x => x.jornada === j);
    const prov = c.provisionales.has(j);
    $('#jornada-detalle').innerHTML = `
      <div class="jornada-cab">
        <h3>Jornada ${j}</h3>
        <p>${cal ? esc(cal.fechas) : ''}${prov ? ' <span class="etiqueta etiqueta-prov">Provisional: hay partidos aplazados</span>' : ''}</p>
      </div>
      <table class="tabla">
        <thead><tr><th scope="col" class="num">Pos.</th><th scope="col">Mánager</th><th scope="col" class="num">Puntos</th><th scope="col"><span class="visually-hidden">Nota</span></th></tr></thead>
        <tbody>${lista.map(f => {
          let tag = '';
          if (f.posicion === 1) tag = '<span class="etiqueta etiqueta-oro">Gana la jornada</span>';
          else if (f.multa && f.pendiente) tag = `<span class="etiqueta etiqueta-prov" title="Se cobra cuando la jornada sea definitiva">Multa pendiente: ${euros(f.multa)}</span>`;
          else if (f.multa) tag = `<span class="etiqueta etiqueta-lacre"${f.noPuntua ? ' title="Multa por la posición más 1 € por no puntuar"' : ''}>Paga ${euros(f.multa)}${f.noPuntua ? ', no puntuó' : ''}</span>`;
          return `<tr><td class="num">${f.posicion}</td><td>${celdaManager(f.m)}</td><td class="num puntos">${f.puntos}</td><td>${tag}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  };
  sel.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) mostrar(+b.dataset.j); });
  sel.addEventListener('keydown', ev => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const bs = [...sel.querySelectorAll('button')];
    const i = bs.findIndex(b => b.getAttribute('aria-selected') === 'true');
    const k = Math.max(0, Math.min(bs.length - 1, i + (ev.key === 'ArrowRight' ? 1 : -1)));
    bs[k].focus(); mostrar(+bs[k].dataset.j);
  });
  if (c.ultima) mostrar(c.ultima);

  // Constancia
  const gan = [...c.stats.values()].sort((a, b) => b.ganadas - a.ganadas || a.m.n - b.m.n);
  const max = Math.max(1, ...gan.map(s => s.ganadas));
  $('#constancia').innerHTML = gan.map(s =>
    `<li><span>${esc(s.m.nombre)}</span><span class="barra-valor" style="width:${(s.ganadas / max) * 100}%;background:${s.m.color}"></span><b>${s.ganadas}</b></li>`).join('');
}

// ---------- Clausulazos ----------
function ventanaActual(periodos) {
  const ahora = Date.now();
  const ps = periodos.map(p => ({ ...p, inicioD: deMadrid(p.inicio), finD: deMadrid(p.fin) })).filter(p => p.inicioD && p.finD);
  return ps.find(p => p.inicioD <= ahora && ahora < p.finD) || ps.filter(p => p.finD <= ahora).at(-1) || ps[0] || null;
}
function periodoDe(fechaIso, periodos) {
  const d = deMadrid(fechaIso);
  const p = periodos.find(p => deMadrid(p.inicio) <= d && d < deMadrid(p.fin));
  return p?.periodo || '';
}

function pintarClausulazos(datos, ventana) {
  const lista = datos.clausulazos
    .map(x => ({ ...x, c: buscarMiembro(x.comprador), v: buscarMiembro(x.vendedor), d: deMadrid(x.fecha) }))
    .filter(x => x.c && x.v)
    .map(x => ({ ...x, periodo: x.periodo || periodoDe(x.fecha, datos.periodos) }))
    .sort((a, b) => (b.d?.getTime() || 0) - (a.d?.getTime() || 0));

  // Ventana actual
  if (ventana) {
    const doble = /doble/i.test(ventana.tipo || '');
    $('#nota-ventana').textContent = `${ventana.periodo}: del ${limpiar(fCierre.format(ventana.inicioD))} a las ${fHora.format(ventana.inicioD)} al ${limpiar(fCierre.format(ventana.finD))} a las ${fHora.format(ventana.finD)}.${doble ? ' Semana de doble jornada.' : ''}`;
    const enVentana = lista.filter(x => norm(x.periodo) === norm(ventana.periodo));
    const max = ventana.maximo || 4;
    const marcas = n => Array.from({ length: Math.max(max, n) }, (_, i) => `<i class="${i < Math.min(n, max) ? 'lleno' : i >= max ? 'exceso' : ''}"></i>`).join('');
    $('#ventana').innerHTML = MIEMBROS.map(m => {
      const hechos = enVentana.filter(x => x.c.n === m.n).length;
      const recibidos = enVentana.filter(x => x.v.n === m.n).length;
      const excede = hechos > max || recibidos > max;
      return `<div class="ventana-ficha${excede ? ' excede' : ''}">
        ${celdaManager(m)}
        <div class="cupo"><span>Hechos</span><b>${hechos} de ${max}</b><span class="cupo-marcas" aria-hidden="true">${marcas(hechos)}</span></div>
        <div class="cupo"><span>Recibidos</span><b>${recibidos} de ${max}</b><span class="cupo-marcas" aria-hidden="true">${marcas(recibidos)}</span></div>
        ${excede ? '<p class="etiqueta etiqueta-lacre" style="margin-top:.6rem">Supera el límite</p>' : ''}
      </div>`;
    }).join('');
  }

  // Récord
  const top = lista.reduce((a, b) => (b.importe > (a?.importe ?? -1) ? b : a), null);
  if (top) {
    $('#record').innerHTML = `
      <div class="record-cifra">${nf.format(top.importe)}<small>M€</small></div>
      <p><strong>${esc(top.jugador)}</strong></p>
      <p>El clausulazo más caro de la temporada: ${esc(top.c.nombre)} se lo quitó a ${esc(top.v.nombre)} el ${limpiar(fFecha.format(top.d))}.</p>`;
  }

  // Balance
  const bal = MIEMBROS.map(m => {
    const h = lista.filter(x => x.c.n === m.n), r = lista.filter(x => x.v.n === m.n);
    const gastado = h.reduce((t, x) => t + x.importe, 0), ingresado = r.reduce((t, x) => t + x.importe, 0);
    return { m, hechos: h.length, recibidos: r.length, gastado, ingresado, balance: ingresado - gastado };
  }).sort((a, b) => b.hechos - a.hechos || b.gastado - a.gastado);
  $('#tabla-balance tbody').innerHTML = bal.map(b => `<tr>
    <td>${celdaManager(b.m)}</td>
    <td class="num">${b.hechos}</td><td class="num">${b.recibidos}</td>
    <td class="num ocultable">${millones(b.gastado)}</td><td class="num ocultable">${millones(b.ingresado)}</td>
    <td class="num ${b.balance >= 0 ? 'positivo' : 'negativo'}">${b.balance > 0 ? '+' : b.balance < 0 ? '−' : ''}${millones(Math.abs(b.balance))}</td>
  </tr>`).join('');

  // Historial
  const filtro = $('#filtro-manager');
  filtro.innerHTML = '<option value="">a todos</option>' + MIEMBROS.map(m => `<option value="${m.n}">a ${esc(m.nombre)}</option>`).join('');
  let todos = false;
  const pintar = () => {
    const n = +filtro.value;
    const f = n ? lista.filter(x => x.c.n === n || x.v.n === n) : lista;
    const vis = todos ? f : f.slice(0, 10);
    $('#tabla-historial tbody').innerHTML = vis.map(x => `<tr class="${x === top ? 'destacado' : ''}">
      <td>${x.d ? limpiar(fFechaHora.format(x.d)) : ''}</td>
      <td><span class="jugador">${esc(x.jugador)}</span>${x.exonera ? '<span class="exonera">Lo anunció otro mánager</span>' : ''}</td>
      <td>${esc(x.c.nombre)}</td>
      <td>${esc(x.v.nombre)}</td>
      <td class="num">${millones(x.importe)}</td>
    </tr>`).join('') || '<tr><td colspan="5">No hay clausulazos de este mánager.</td></tr>';
    const btn = $('#ver-mas');
    btn.hidden = todos || f.length <= 10;
    btn.textContent = `Ver los ${f.length}`;
  };
  filtro.addEventListener('change', () => { todos = false; pintar(); });
  $('#ver-mas').addEventListener('click', () => { todos = true; pintar(); });
  pintar();
}

// ---------- Tesorería ----------
function pintarTesoreria(c, datos) {
  const sanciones = datos.sanciones.map(x => ({ ...x, m: buscarMiembro(x.manager) })).filter(x => x.m);
  const pagos = datos.pagos.map(x => ({ ...x, m: buscarMiembro(x.manager) })).filter(x => x.m);
  const filas = MIEMBROS.map(m => {
    const s = c.stats.get(m.n);
    const sanc = sanciones.filter(x => x.m.n === m.n).reduce((t, x) => t + x.importe, 0);
    const pagado = pagos.filter(x => x.m.n === m.n).reduce((t, x) => t + x.importe, 0);
    const total = s.clasificacion + s.noPuntua + sanc;
    return { m, clasificacion: s.clasificacion, noPuntua: s.noPuntua, sanc, total, pagado, debe: total - pagado };
  }).sort((a, b) => b.debe - a.debe || b.total - a.total || a.m.n - b.m.n);
  const suma = k => filas.reduce((t, f) => t + f[k], 0);

  $('#cuentas-resumen').innerHTML = [
    ['Multas acumuladas', euros(suma('total'))],
    ['Pagado al tesorero', euros(suma('pagado'))],
    ['Pendiente de pago', euros(Math.max(0, suma('debe')))],
  ].map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('');

  const debe = v => v > 0 ? `<span class="debe">${euros(v)}</span>` : v < 0 ? `<span class="positivo">${euros(-v)} a favor</span>` : 'Al día';
  $('#tabla-cuentas tbody').innerHTML = filas.map(f => `<tr>
    <td>${celdaManager(f.m)}</td>
    <td class="num ocultable">${euros(f.clasificacion)}</td>
    <td class="num ocultable">${euros(f.noPuntua)}</td>
    <td class="num ocultable">${euros(f.sanc)}</td>
    <td class="num">${euros(f.total)}</td>
    <td class="num">${euros(f.pagado)}</td>
    <td class="num">${debe(f.debe)}</td>
  </tr>`).join('');
  $('#tabla-cuentas tfoot').innerHTML = `<tr>
    <td>Total</td>
    <td class="num ocultable">${euros(suma('clasificacion'))}</td>
    <td class="num ocultable">${euros(suma('noPuntua'))}</td>
    <td class="num ocultable">${euros(suma('sanc'))}</td>
    <td class="num">${euros(suma('total'))}</td>
    <td class="num">${euros(suma('pagado'))}</td>
    <td class="num">${euros(Math.max(0, suma('debe')))}</td>
  </tr>`;
  $('#nota-provisional-multas').textContent = c.provisionales.size
    ? `Las jornadas ${[...c.provisionales].join(' y ')} no cuentan hasta que sean definitivas.` : '';

  const cuando = x => x.jornada ? `J${x.jornada}` : x.fecha ? limpiar(fFecha.format(deMadrid(x.fecha))) : '–';
  const extra = [
    ...c.indebidas,
    ...sanciones.map(x => ({ ...x, orden: x.fecha ? deMadrid(x.fecha).getTime() : 0 })),
  ];
  $('#lista-sanciones tbody').innerHTML = extra.length
    ? extra.map(x => `<tr>
        <td>${cuando(x)}</td>
        <td>${celdaManager(x.m)}</td>
        <td>${esc(x.concepto)}</td>
        <td class="num">${euros(x.importe)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4">No hay sanciones.</td></tr>';

  $('#lista-pagos').innerHTML = pagos.length
    ? `<table class="tabla tabla-compacta"><thead><tr><th scope="col">Fecha</th><th scope="col">Mánager</th><th scope="col" class="num">Importe</th></tr></thead><tbody>${
      pagos.sort((a, b) => (deMadrid(b.fecha)?.getTime() || 0) - (deMadrid(a.fecha)?.getTime() || 0)).map(x => `<tr>
        <td>${x.fecha ? limpiar(fFecha.format(deMadrid(x.fecha))) : '–'}</td>
        <td>${esc(x.m.nombre)}${x.nota ? `<span class="exonera">${esc(x.nota)}</span>` : ''}</td>
        <td class="num">${euros(x.importe)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vacio">Todavía no hay pagos apuntados. Cuando alguien pague al tesorero, se añade una fila en la pestaña Pagos de la hoja NLF – Administración y aquí se descuenta.</p>';
}

// ---------- Calendario ----------
function pintarCalendario(c, calendario) {
  const notas = { 'Fin de la primera vuelta': 'Campeón de invierno' };
  $('#lista-calendario').innerHTML = calendario.map(x => {
    const jugada = x.jornada <= c.ultima;
    const prox = x.jornada === c.ultima + 1;
    const lineas = [];
    if (jugada && c.porJornada.has(x.jornada)) {
      const g = c.porJornada.get(x.jornada)[0];
      lineas.push(`Gana ${esc(g.m.corto)} (${g.puntos})${c.provisionales.has(x.jornada) ? ', provisional' : ''}`);
    } else if (prox) lineas.push('Próxima');
    if (x.nota) lineas.push(esc(notas[x.nota] || x.nota));
    const cls = [jugada ? 'jugada' : '', prox ? 'proxima' : '', x.nota && !jugada ? 'hito' : ''].join(' ');
    return `<li class="${cls}"${prox ? ' aria-current="date"' : ''}>
      <span class="cal-num">J${x.jornada}</span>
      <span class="cal-fecha">${esc(x.fechas)}</span>
      <span class="cal-extra">${lineas.join('<br>')}</span>
    </li>`;
  }).join('');
}

function pintarMiembros() {
  $('#miembros').innerHTML = MIEMBROS.map(m => `<li>
    <span class="ordinal">${m.n}</span>
    <strong>${esc(m.completo || m.nombre)}</strong>
    <span>${[m.completo ? `«${m.nombre}»` : '', m.alias ? `«${m.alias}»` : '', `${m.usuario} en la app`].filter(Boolean).join(', ')}</span>
  </li>`).join('');
}

function pintarEstado(datos) {
  const copia = Object.entries(datos.fuentes).filter(([, v]) => v === 'copia').map(([k]) => k);
  const nombres = { jornadas: 'las jornadas', clausulazos: 'los clausulazos', periodos: 'las semanas de clausulazos', sanciones: 'las sanciones', pagos: 'los pagos' };
  $('#estado-datos').textContent = copia.length === 0
    ? `Datos leídos de las hojas el ${limpiar(fFechaHora.format(new Date(datos.actualizado)))}.`
    : `Ahora mismo no se pueden leer ${copia.map(k => nombres[k]).join(', ')} de la hoja; se muestra la copia del ${limpiar(fFecha.format(deMadrid(datos.copiaDe)))}.`;
}

// ---------- App de Shiny para apuntar clausulazos ----------
// Solo se carga al abrir el panel y se descarga al cerrarlo, para no gastar horas de shinyapps.io.
const URL_SHINY = 'https://poskyin.shinyapps.io/appnlf/';
function prepararShiny() {
  const boton = $('#abrir-shiny'), panel = $('#panel-shiny'), marco = $('#marco-shiny');
  if (!boton) return;
  boton.addEventListener('click', () => {
    const abrir = panel.hidden;
    panel.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
    boton.textContent = abrir ? 'Cerrar el formulario' : 'Apuntar un clausulazo';
    marco.innerHTML = abrir ? `<iframe src="${URL_SHINY}" title="Formulario para apuntar un clausulazo"></iframe>` : '';
    if (abrir) panel.scrollIntoView({ block: 'nearest' });
  });
}

// ---------- Arranque ----------
// Cada sección se pinta por separado: si una falla, las demás siguen apareciendo.
function seguro(nombre, fn) {
  try { fn(); } catch (e) { console.error(`Error al pintar ${nombre}:`, e); }
}

(async () => {
  seguro('shiny', prepararShiny);
  let datos;
  try {
    datos = await cargar();
  } catch (e) {
    console.error(e);
    $('#parte').textContent = 'No se han podido cargar los datos. Recarga la página en un momento.';
    return;
  }
  const c = calcular(datos.jornadas);
  let ventana = null;
  seguro('ventana', () => { ventana = ventanaActual(datos.periodos); });
  seguro('portada', () => pintarPortada(c, datos, ventana));
  seguro('clasificación', () => pintarGeneral(c));
  seguro('evolución', () => {
    pintarEvolucion(c);
    let anchoPrevio = $('#lienzo').clientWidth;
    new ResizeObserver(() => {
      const a = $('#lienzo').clientWidth;
      if (Math.abs(a - anchoPrevio) > 24) { anchoPrevio = a; seguro('evolución', () => pintarEvolucion(c)); }
    }).observe($('#lienzo'));
  });
  seguro('jornadas', () => pintarJornadas(c, datos.calendario));
  seguro('clausulazos', () => pintarClausulazos(datos, ventana));
  seguro('tesorería', () => pintarTesoreria(c, datos));
  seguro('calendario', () => pintarCalendario(c, datos.calendario));
  seguro('miembros', () => pintarMiembros());
  seguro('estado', () => pintarEstado(datos));
})();
