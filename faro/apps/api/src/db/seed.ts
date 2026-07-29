/**
 * Datos de prueba.
 *
 * Genera un parque de instalaciones realista y una campaña de ejemplo por cada
 * formato, para que el dashboard tenga algo que mostrar desde el primer minuto
 * de la demo.
 */
import { randomUUID } from 'node:crypto';
import { PLANTILLAS } from '@faro/contracts';
import { pool } from './pool.ts';
import { USUARIOS_DEV } from '../auth/usuarios-dev.ts';

const SUCURSALES = [
  { codigo: 'S001', region: 'RM', nombre: 'Casa Matriz' },
  { codigo: 'S014', region: 'RM', nombre: 'Providencia' },
  { codigo: 'S027', region: 'RM', nombre: 'Maipú' },
  { codigo: 'S045', region: 'V', nombre: 'Viña del Mar' },
  { codigo: 'S092', region: 'V', nombre: 'Valparaíso Puerto' },
  { codigo: 'S104', region: 'VIII', nombre: 'Concepción Centro' },
  { codigo: 'S118', region: 'VIII', nombre: 'Talcahuano' },
];

const ROLES = ['EJEC_COMERCIAL', 'EJEC_CAJA', 'JEFE_SUC', 'PLATAFORMA'];

/** Generador determinístico: el seed produce siempre el mismo parque. */
function crearAleatorio(semilla: number): () => number {
  let estado = semilla;
  return () => {
    estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return estado / 4_294_967_296;
  };
}

async function sembrar(): Promise<void> {
  console.log('Sembrando datos de prueba…');

  // ── Plantillas ────────────────────────────────────────────────────────────
  for (const plantilla of Object.values(PLANTILLAS)) {
    await pool.query(
      `INSERT INTO templates (key, nombre, descripcion, formato, min_extension_version)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion`,
      [plantilla.key, plantilla.nombre, plantilla.descripcion, plantilla.formato, plantilla.minVersionExtension],
    );
  }
  console.log(`  ✓ ${Object.keys(PLANTILLAS).length} plantillas`);

  // ── Usuarios del panel ────────────────────────────────────────────────────
  for (const usuario of USUARIOS_DEV.filter((u) => u.rolAdmin)) {
    await pool.query(
      `INSERT INTO admin_users (idp_subject, email, nombre, rol)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (idp_subject) DO UPDATE SET rol = EXCLUDED.rol`,
      [usuario.sub, usuario.email, usuario.nombre, usuario.rolAdmin],
    );
  }
  console.log(`  ✓ ${USUARIOS_DEV.filter((u) => u.rolAdmin).length} usuarios del panel`);

  // ── Parque de instalaciones sintético ─────────────────────────────────────
  const aleatorio = crearAleatorio(20260729);
  const total = 240;
  let creadas = 0;

  for (let i = 0; i < total; i++) {
    const installId = `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`;
    const sucursal = SUCURSALES[Math.floor(aleatorio() * SUCURSALES.length)]!;
    const rol = ROLES[Math.floor(aleatorio() * ROLES.length)]!;

    // Un 12% lleva más de 7 días sin aparecer: es la brecha entre "instalados
    // totales" y "activos", que es justamente la métrica de salud del
    // despliegue que hay que poder mostrar.
    const inactivo = aleatorio() < 0.12;
    const diasSinVer = inactivo ? 8 + Math.floor(aleatorio() * 40) : Math.floor(aleatorio() * 3);

    await pool.query(
      `INSERT INTO installs (install_id, primera_vez, ultimo_visto, extension_version, chrome_version, so)
       VALUES ($1, now() - interval '60 days', now() - ($2 || ' days')::interval, $3, '131.0.0.0', 'Windows')
       ON CONFLICT (install_id) DO UPDATE SET ultimo_visto = EXCLUDED.ultimo_visto`,
      [installId, diasSinVer, aleatorio() < 0.85 ? '0.1.0' : '0.0.9'],
    );

    // Un 15% sin atributos del directorio: el caso realista de que el SSO no
    // los entregue y la persona tenga que auto-declararlos.
    const autoDeclarado = aleatorio() < 0.15;

    await pool.query(
      `INSERT INTO install_profiles (install_id, employee_id, email, rol, sucursal, region, area, tags, origen_perfil)
       VALUES ($1,$2,$3,$4,$5,$6,'COMERCIAL',$7,$8)
       ON CONFLICT (install_id) DO UPDATE SET sucursal = EXCLUDED.sucursal`,
      [
        installId,
        `E${(40000 + i).toString()}`,
        `sintetico${i}@banco.cl`,
        rol,
        sucursal.codigo,
        sucursal.region,
        aleatorio() < 0.2 ? ['piloto_hipotecario'] : [],
        autoDeclarado ? 'auto_declarado' : 'verificado',
      ],
    );
    creadas++;
  }
  console.log(`  ✓ ${creadas} instalaciones sintéticas en ${SUCURSALES.length} sucursales`);

  // ── Campañas de ejemplo, una por formato ──────────────────────────────────
  const operador = await pool.query<{ id: string }>(
    `SELECT id FROM admin_users WHERE email = 'operador.canales@banco.cl'`,
  );
  const autorId = operador.rows[0]?.id;
  if (!autorId) throw new Error('No se encontró el usuario operador');

  await crearCampanaEjemplo(autorId, {
    key: 'contingencia-app-movil',
    nombre: 'Contingencia app móvil',
    categoria: 'contingencia',
    prioridad: 0,
    templateKey: 'huincha_alerta_v1',
    contenido: {
      severidad: 'critica',
      icono: 'alerta',
      titulo: 'App móvil con intermitencia',
      cuerpo: 'Algunos clientes no logran iniciar sesión. *Equipos trabajando en la solución.*',
      cta: {
        id: 'ver_estado',
        label: 'Ver estado',
        accion: { kind: 'abrir_url', url: 'http://localhost:8080/estado.html' },
      },
    },
    presentacion: {
      formato: 'huincha',
      descartable: false,
      exigeAcuse: true,
      frecuencia: { maxPorDia: 20, intervaloMinimoMin: 0, unaVezPorSesion: false, reaparecerTrasDescarteMin: 5, insistirHastaAcuse: true },
      origenesPermitidos: [],
    },
    audiencia: { reglas: null },
    experimento: { controlPct: 0, rolloutPct: 100, salt: 'v1' },
  });

  await crearCampanaEjemplo(autorId, {
    key: 'lanzamiento-cuenta-digital',
    nombre: 'Lanzamiento cuenta digital',
    categoria: 'lanzamiento',
    prioridad: 2,
    templateKey: 'modal_anuncio_v1',
    contenido: {
      severidad: 'info',
      icono: 'regalo',
      titulo: 'Nueva cuenta digital disponible',
      cuerpo: 'Desde hoy los clientes pueden abrir su cuenta 100% en línea.\nRevisa el material de apoyo antes de atender.',
      imagen: null,
      ctaPrimario: {
        id: 'ver_material',
        label: 'Ver material',
        accion: { kind: 'abrir_url', url: 'http://localhost:8080/material.html' },
      },
      ctaSecundario: null,
      etiquetaConfirmacion: 'Entendido',
    },
    presentacion: {
      formato: 'modal',
      descartable: true,
      exigeAcuse: true,
      frecuencia: { maxPorDia: 1, intervaloMinimoMin: 480, unaVezPorSesion: true, reaparecerTrasDescarteMin: 1440, insistirHastaAcuse: false },
      origenesPermitidos: [],
    },
    audiencia: { reglas: { attr: 'rol', op: 'in', values: ['EJEC_COMERCIAL', 'JEFE_SUC'] } },
    experimento: { controlPct: 20, rolloutPct: 100, salt: 'v1' },
  });

  await crearCampanaEjemplo(autorId, {
    key: 'promo-hipotecario-verano',
    nombre: 'Promoción hipotecario',
    categoria: 'promocion',
    prioridad: 3,
    templateKey: 'drawer_conversacion_v1',
    contenido: {
      severidad: 'info',
      icono: 'info',
      titulo: 'Campaña hipotecaria',
      subtitulo: 'Vigente hasta fin de mes',
      burbujas: [
        { texto: 'Tasa preferencial para clientes con cuenta corriente activa.', imagen: null },
        { texto: 'El simulador ya está actualizado con las nuevas condiciones.', imagen: null },
      ],
      cta: {
        id: 'abrir_simulador',
        label: 'Abrir simulador',
        accion: { kind: 'abrir_url', url: 'http://localhost:8080/simulador.html' },
      },
    },
    presentacion: {
      formato: 'drawer',
      descartable: true,
      exigeAcuse: false,
      frecuencia: { maxPorDia: 2, intervaloMinimoMin: 240, unaVezPorSesion: false, reaparecerTrasDescarteMin: 720, insistirHastaAcuse: false },
      origenesPermitidos: [],
    },
    audiencia: { reglas: { attr: 'tags', op: 'contains', value: 'piloto_hipotecario' } },
    experimento: { controlPct: 30, rolloutPct: 100, salt: 'v1' },
  });

  // ── Audiencias reutilizables ──────────────────────────────────────────────
  const audiencias = [
    { nombre: 'Toda la red', reglas: null },
    { nombre: 'Región Metropolitana', reglas: { attr: 'region', op: 'eq', value: 'RM' } },
    {
      nombre: 'Ejecutivos de atención directa',
      reglas: { attr: 'rol', op: 'in', values: ['EJEC_COMERCIAL', 'EJEC_CAJA'] },
    },
    {
      nombre: 'Piloto hipotecario',
      reglas: { attr: 'tags', op: 'contains', value: 'piloto_hipotecario' },
    },
  ];
  for (const a of audiencias) {
    await pool.query(
      'INSERT INTO audiences (nombre, reglas, creado_por) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [a.nombre, JSON.stringify(a.reglas), autorId],
    );
  }
  console.log(`  ✓ ${audiencias.length} audiencias`);

  console.log('\nListo. Usuarios del panel:');
  for (const u of USUARIOS_DEV.filter((x) => x.rolAdmin)) {
    console.log(`  ${u.email.padEnd(28)} ${u.rolAdmin}`);
  }
  console.log('\nEjecutivos para probar la extensión:');
  for (const u of USUARIOS_DEV.filter((x) => !x.rolAdmin)) {
    console.log(`  ${u.email.padEnd(28)} ${u.sucursal ?? '(sin sucursal — auto-declara)'}`);
  }
}

interface CampanaEjemplo {
  key: string;
  nombre: string;
  categoria: string;
  prioridad: number;
  templateKey: string;
  contenido: unknown;
  presentacion: unknown;
  audiencia: unknown;
  experimento: unknown;
}

/**
 * Crea la campaña en estado borrador, con su versión 1 lista para el flujo de
 * aprobación. No se publican aquí a propósito: la demo consiste precisamente en
 * recorrer el doble control y ver la huincha aparecer.
 */
async function crearCampanaEjemplo(autorId: string, ejemplo: CampanaEjemplo): Promise<void> {
  const existente = await pool.query('SELECT id FROM campaigns WHERE key = $1', [ejemplo.key]);
  if (existente.rows.length > 0) {
    console.log(`  · ${ejemplo.key} ya existe`);
    return;
  }

  const campana = await pool.query<{ id: string }>(
    `INSERT INTO campaigns (key, nombre, categoria, prioridad, template_key, creado_por, actualizado_por, version_actual)
     VALUES ($1,$2,$3::categoria_campana,$4,$5,$6,$6,1) RETURNING id`,
    [ejemplo.key, ejemplo.nombre, ejemplo.categoria, ejemplo.prioridad, ejemplo.templateKey, autorId],
  );

  await pool.query(
    `INSERT INTO campaign_versions (campaign_id, version, contenido, presentacion, audiencia, experimento, creado_por)
     VALUES ($1, 1, $2, $3, $4, $5, $6)`,
    [
      campana.rows[0]!.id,
      JSON.stringify({ templateKey: ejemplo.templateKey, campos: ejemplo.contenido }),
      JSON.stringify(ejemplo.presentacion),
      JSON.stringify(ejemplo.audiencia),
      JSON.stringify(ejemplo.experimento),
      autorId,
    ],
  );

  console.log(`  ✓ campaña "${ejemplo.nombre}" (borrador, versión 1)`);
}

sembrar()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
