/**
 * Usuarios del proveedor de identidad de desarrollo.
 *
 * Reproducen la forma exacta de los claims que entregaría Entra ID o Google
 * Workspace, incluyendo el caso realista de que el IdP corporativo NO exponga
 * sucursal ni rol — ver `ana.morales`, que llega sin atributos y tiene que
 * auto-declarar su sucursal.
 */

export interface UsuarioDev {
  sub: string;
  email: string;
  nombre: string;
  /** Rol en el panel de administración. */
  rolAdmin: 'viewer' | 'editor' | 'approver' | 'admin' | null;
  /** Atributos laborales para la segmentación. */
  employeeId: string;
  rol: string | null;
  sucursal: string | null;
  region: string | null;
  area: string | null;
  tags: string[];
}

export const USUARIOS_DEV: UsuarioDev[] = [
  {
    sub: 'dev|operador',
    email: 'operador.canales@banco.cl',
    nombre: 'Carla Fuentes',
    rolAdmin: 'editor',
    employeeId: 'E10001',
    rol: 'OPERADOR_CANALES',
    sucursal: null,
    region: 'RM',
    area: 'CANALES_DIGITALES',
    tags: [],
  },
  {
    sub: 'dev|aprobador',
    email: 'jefe.canales@banco.cl',
    nombre: 'Rodrigo Pizarro',
    rolAdmin: 'approver',
    employeeId: 'E10002',
    rol: 'JEFE_CANALES',
    sucursal: null,
    region: 'RM',
    area: 'CANALES_DIGITALES',
    tags: [],
  },
  {
    sub: 'dev|admin',
    email: 'admin.faro@banco.cl',
    nombre: 'Soledad Ramírez',
    rolAdmin: 'admin',
    employeeId: 'E10003',
    rol: 'ADMIN_PLATAFORMA',
    sucursal: null,
    region: 'RM',
    area: 'TI',
    tags: [],
  },
  {
    sub: 'dev|ejecutivo1',
    email: 'm.tapia@banco.cl',
    nombre: 'Marcela Tapia',
    rolAdmin: null,
    employeeId: 'E20001',
    rol: 'EJEC_COMERCIAL',
    sucursal: 'S001',
    region: 'RM',
    area: 'COMERCIAL',
    tags: ['piloto_hipotecario'],
  },
  {
    sub: 'dev|ejecutivo2',
    email: 'j.riquelme@banco.cl',
    nombre: 'Jorge Riquelme',
    rolAdmin: null,
    employeeId: 'E20002',
    rol: 'EJEC_CAJA',
    sucursal: 'S014',
    region: 'RM',
    area: 'COMERCIAL',
    tags: [],
  },
  {
    sub: 'dev|ejecutivo3',
    email: 'p.soto@banco.cl',
    nombre: 'Paulina Soto',
    rolAdmin: null,
    employeeId: 'E20003',
    rol: 'EJEC_COMERCIAL',
    sucursal: 'S092',
    region: 'V',
    area: 'COMERCIAL',
    tags: [],
  },
  {
    sub: 'dev|ejecutivo4',
    email: 'ana.morales@banco.cl',
    nombre: 'Ana Morales',
    rolAdmin: null,
    employeeId: 'E20004',
    // Caso realista: el IdP corporativo no expone atributos laborales. La
    // extensión le pedirá auto-declarar su sucursal, y el dashboard marcará su
    // perfil como 'auto_declarado'.
    rol: null,
    sucursal: null,
    region: null,
    area: null,
    tags: [],
  },
  {
    sub: 'dev|backoffice',
    email: 'r.vega@banco.cl',
    nombre: 'Rodrigo Vega',
    rolAdmin: 'viewer',
    employeeId: 'E30001',
    rol: 'ANALISTA',
    sucursal: null,
    region: 'RM',
    area: 'BACKOFFICE',
    tags: [],
  },
];

export function buscarUsuarioDev(sub: string): UsuarioDev | null {
  return USUARIOS_DEV.find((u) => u.sub === sub) ?? null;
}

export function buscarUsuarioDevPorEmail(email: string): UsuarioDev | null {
  return USUARIOS_DEV.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}
