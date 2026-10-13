// Lee las hojas de Google y devuelve los datos de la liga en JSON.
// Si alguna hoja no se puede leer, esa parte vuelve vacía y la web usa la copia de /data/respaldo.json.

const HOJA_CLAUSULAZOS = '1N3n748kTBGl2To4PlyuW0_UKvf72ci3gco2pJnh8DQE';
const HOJA_JORNADAS = '1oWKcSJjM6GOtgYxzplS8v4oc5ireHNhkTOTFNSeTch4';

const urlCsv = (id, pestana) =>
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1` +
  (pestana ? `&sheet=${encodeURIComponent(pestana)}` : '');

export function parseCsv(texto) {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(v => v.trim() !== ''));
}

// Convierte la hoja en objetos usando la cabecera. Exige que estén las columnas esperadas
// (si la pestaña no existe, Google devuelve otra y así lo detectamos).
function aObjetos(filas, columnas) {
  if (!filas.length) throw new Error('hoja vacía');
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const cab = filas[0].map(norm);
  const idx = {};
  for (const col of columnas) {
    const i = cab.indexOf(norm(col));
    if (i < 0) throw new Error(`falta la columna ${col}`);
    idx[col] = i;
  }
  return filas.slice(1).map(f => Object.fromEntries(columnas.map(c => [c, (f[idx[c]] ?? '').trim()])));
}

export const numero = v => {
  if (v == null || v === '') return NaN;
  let s = String(v).replace(/\s|€|M/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  return parseFloat(s);
};

// Acepta "2026-09-26 15:48:32", "26/09/2026 15:48:32" o "26/09/2026 15:48"
export function fechaIso(v) {
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]?(\d{1,2})?:?(\d{2})?:?(\d{2})?/);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${se.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2})?:?(\d{2})?:?(\d{2})?/);
  if (m) {
    const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${se.padStart(2, '0')}`;
  }
  return '';
}

const si = v => /^(s[ií]|si|yes|true|1|x)$/i.test(String(v).trim());

async function leer(id, pestana) {
  const r = await fetch(urlCsv(id, pestana), { headers: { 'user-agent': 'NLF-web' } });
  const tipo = r.headers.get('content-type') || '';
  if (!r.ok || tipo.includes('text/html')) throw new Error(`sin acceso (${r.status})`);
  return parseCsv(await r.text());
}

export async function jornadas() {
  const filas = aObjetos(await leer(HOJA_JORNADAS), ['Jornada', 'Posicion', 'Usuario', 'Puntos', 'Provisional']);
  return filas
    .map(f => ({
      jornada: parseInt(f.Jornada, 10),
      posicion: parseInt(f.Posicion, 10),
      usuario: f.Usuario,
      puntos: numero(f.Puntos),
      provisional: si(f.Provisional),
    }))
    .filter(f => f.jornada > 0 && f.usuario && !Number.isNaN(f.puntos));
}

export async function clausulazos() {
  const cols = ['Marca_Temporal', 'Comprador', 'Vendedor', 'Jugador', 'Importe', 'Tercero_Exonera', 'Tipo', 'Periodo'];
  const filas = aObjetos(await leer(HOJA_CLAUSULAZOS, 'Hoja 1'), cols);
  return filas
    .map(f => ({
      fecha: fechaIso(f.Marca_Temporal),
      comprador: f.Comprador,
      vendedor: f.Vendedor,
      jugador: f.Jugador,
      importe: numero(f.Importe),
      exonera: si(f.Tercero_Exonera),
      tipo: f.Tipo || 'Clausulazo',
      periodo: f.Periodo,
    }))
    .filter(f => f.comprador && f.jugador);
}

export async function periodos() {
  const cols = ['Jornada', 'Inicio Ventana', 'Fin Ventana', 'Tipo Semana', 'Clausulazos Máx'];
  const filas = aObjetos(await leer(HOJA_CLAUSULAZOS, 'Periodos'), cols);
  return filas
    .map(f => ({
      periodo: f.Jornada,
      inicio: fechaIso(f['Inicio Ventana']),
      fin: fechaIso(f['Fin Ventana']),
      tipo: f['Tipo Semana'],
      maximo: parseInt(f['Clausulazos Máx'], 10) || 4,
    }))
    .filter(f => f.periodo && f.inicio && f.fin);
}

export default async function handler(req, res) {
  const partes = { jornadas, clausulazos, periodos };
  const salida = { actualizado: new Date().toISOString(), fuentes: {} };
  await Promise.all(Object.entries(partes).map(async ([nombre, fn]) => {
    try {
      salida[nombre] = await fn();
      salida.fuentes[nombre] = 'hoja';
    } catch (e) {
      salida[nombre] = [];
      salida.fuentes[nombre] = `error: ${e.message}`;
    }
  }));
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify(salida));
}
