/**
 * Constantes compartidas del módulo Dealership (D-106 admin onboarding).
 *
 * Extraídas de `prisma-dealership.repository.ts` para que el alta admin
 * (onboarding administrado, módulo Administration) y el repository del alta
 * rápida (D-103) usen EXACTAMENTE los mismos valores/permisos. Única fuente
 * de verdad para los roles por defecto de una concesionaria.
 */

/**
 * Roles por defecto de una concesionaria (RB-10, seed): owner/admin/seller.
 *
 * A diferencia de workshops (donde el repository y el seed usan códigos
 * divergentes), aquí los códigos SIEMPRE deben coincidir con la matriz del
 * seed `systemDealershipRolePermissions` (owner 100 > admin 60 > seller 40)
 * porque las concesionarias demo se siembran con esos mismos roles.
 */
export const DEFAULT_ROLES = [
  { code: 'owner', name: 'Owner', priority: 100 },
  { code: 'admin', name: 'Admin', priority: 60 },
  { code: 'seller', name: 'Seller', priority: 40 },
];

// RB-10: matriz de permisos de la cadena de consignación (resolución PM §8).
// `dealership.create` se excluye deliberadamente: es un permiso a nivel
// platform que NO se asigna a roles de concesionaria (comentario L641-642
// del seed). El alta rápida (D-103) se cubre con POST /dealerships autenticado.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'dealership.update',
    'dealership.members.invite',
    'dealership.members.role.update',
    'dealership.members.remove',
    'dealership.vehicle.take',
    'dealership.vehicle.sell',
    'dealership.vehicle.return',
    'care-episode.create',
    'history.view',
  ],
  admin: [
    'dealership.update',
    'dealership.members.invite',
    'dealership.vehicle.take',
    'care-episode.create',
    'history.view',
  ],
  seller: [
    // D-TL-19: el vendedor también acepta QRs de TOMA (owner/admin/seller).
    'dealership.vehicle.take',
    'dealership.vehicle.sell',
    'dealership.vehicle.return',
    'care-episode.create',
    'history.view',
  ],
};
