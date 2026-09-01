/* Utilidades de fecha.
 * Todas las fechas del sistema se guardan como texto ISO corto "AAAA-MM-DD"
 * (sin hora ni zona horaria) para que no se corran de día al cambiar de huso.
 * Las funciones son puras: reciben y devuelven texto o Date en hora local. */

const MS_DIA = 86400000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Fecha de hoy a medianoche, en hora local. */
export function hoy() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Texto ISO corto de hoy. */
export function hoyISO() {
  return aISO(hoy());
}

/** Date -> "AAAA-MM-DD". Devuelve null si no es una fecha válida. */
export function aISO(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null;
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

/** "AAAA-MM-DD" -> Date local a medianoche. Devuelve null si no se puede leer. */
export function deISO(iso) {
  if (iso instanceof Date) return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Días enteros desde `desde` hasta `hasta`. Positivo si `hasta` es posterior. */
export function diffDias(desde, hasta) {
  const a = deISO(desde);
  const b = deISO(hasta);
  if (!a || !b) return null;
  // Se normaliza a UTC para que un cambio de horario de verano no reste horas.
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS_DIA);
}

/** Suma (o resta, con n negativo) días a una fecha ISO. Devuelve ISO. */
export function sumarDias(iso, n) {
  const d = deISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return aISO(d);
}

/** Suma meses conservando el día; si el mes destino es más corto, cae en su último día. */
export function sumarMeses(iso, n) {
  const d = deISO(iso);
  if (!d) return null;
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, diasDelMes(d.getFullYear(), d.getMonth())));
  return aISO(d);
}

export function diasDelMes(anio, mes) {
  return new Date(anio, mes + 1, 0).getDate();
}

export function esFinDeSemana(iso) {
  const d = deISO(iso);
  if (!d) return false;
  return d.getDay() === 0 || d.getDay() === 6;
}

/** Siguiente día hábil estrictamente posterior a `iso`. */
export function siguienteHabil(iso) {
  let r = sumarDias(iso, 1);
  while (r && esFinDeSemana(r)) r = sumarDias(r, 1);
  return r;
}

/** Días hábiles (lunes a viernes) entre dos fechas, sin contar la inicial. */
export function diasHabiles(desde, hasta) {
  const total = diffDias(desde, hasta);
  if (total === null) return null;
  const paso = total >= 0 ? 1 : -1;
  let cursor = desde;
  let cuenta = 0;
  for (let i = 0; i < Math.abs(total); i++) {
    cursor = sumarDias(cursor, paso);
    if (!esFinDeSemana(cursor)) cuenta += paso;
  }
  return cuenta;
}

/** Lunes de la semana de `iso`. */
export function inicioSemana(iso) {
  const d = deISO(iso);
  if (!d) return null;
  const dia = d.getDay();            // 0 domingo … 6 sábado
  const retroceso = (dia + 6) % 7;   // lunes = 0
  return sumarDias(aISO(d), -retroceso);
}

/** Domingo de la semana de `iso`. */
export function finSemana(iso) {
  const ini = inicioSemana(iso);
  return ini ? sumarDias(ini, 6) : null;
}

export function inicioMes(iso) {
  const d = deISO(iso);
  return d ? aISO(new Date(d.getFullYear(), d.getMonth(), 1)) : null;
}

export function finMes(iso) {
  const d = deISO(iso);
  return d ? aISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) : null;
}

/** "3 mar" / "3 mar 2026" / "mié 3 mar". */
export function formatear(iso, opciones = {}) {
  const d = deISO(iso);
  if (!d) return '—';
  const partes = [];
  if (opciones.diaSemana) partes.push(DIAS[d.getDay()]);
  partes.push(String(d.getDate()));
  partes.push(opciones.mesLargo ? MESES_LARGOS[d.getMonth()] : MESES[d.getMonth()]);
  if (opciones.anio || d.getFullYear() !== hoy().getFullYear()) partes.push(String(d.getFullYear()));
  return partes.join(' ');
}

export function nombreMes(indice, largo = false) {
  return largo ? MESES_LARGOS[indice] : MESES[indice];
}

/** "hoy", "mañana", "ayer", "en 4 días", "hace 12 días". */
export function humano(iso, referencia = hoyISO()) {
  const d = diffDias(referencia, iso);
  if (d === null) return '—';
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  if (d > 0) return d < 7 ? `en ${d} días` : `en ${Math.round(d / 7)} sem`;
  const a = Math.abs(d);
  return a < 7 ? `hace ${a} días` : `hace ${Math.round(a / 7)} sem`;
}

/** Texto de duración a partir de horas: "6 h", "1,5 d" (jornada de 8 horas). */
export function horasHumanas(horas) {
  if (horas === null || horas === undefined || horas === '') return '—';
  const n = Number(horas);
  if (!Number.isFinite(n)) return '—';
  if (n < 8) return `${redondear(n)} h`;
  return `${redondear(n / 8)} d`;
}

function redondear(n) {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Lista de fechas ISO desde `desde` hasta `hasta`, ambas incluidas. */
export function rango(desde, hasta) {
  const total = diffDias(desde, hasta);
  if (total === null || total < 0) return [];
  const salida = [];
  for (let i = 0; i <= total; i++) salida.push(sumarDias(desde, i));
  return salida;
}

/** El menor y el mayor de una lista de fechas ISO, ignorando nulos. */
export function extremos(fechas) {
  const validas = fechas.filter(Boolean).sort();
  return { min: validas[0] || null, max: validas[validas.length - 1] || null };
}
