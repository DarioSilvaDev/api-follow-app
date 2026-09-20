/**
 * Constantes compartidas del módulo Workshop (D-106 admin onboarding).
 *
 * Extraídas de la matriz del seed `systemWorkshopRolePermissions`
 * (owner 100 > mechanic 50 > employee 30). El onboarding admin y el seed
 * deben usar EXACTAMENTE los mismos roles/permisos por defecto de un taller.
 *
 * NOTA: el repository del alta rápida legacy (`PrismaWorkshopRepository.create`)
 * usa códigos divergentes (admin/mechanic/receptionist/viewer). Ese flujo se
 * retira con D-106 (alta self-service fuera); el onboarding admin NO reutiliza
 * esos códigos para no duplicar la divergencia documentada en el seed.
 */
export const WORKSHOP_DEFAULT_ROLES = [
  { code: 'owner', name: 'Owner', priority: 100 },
  { code: 'mechanic', name: 'Mechanic', priority: 50 },
  { code: 'employee', name: 'Employee', priority: 30 },
];

// D-024 A1 + Security Review items 1 & 8: matriz de permisos de los roles
// sistémicos de taller (espejo del seed `systemWorkshopRolePermissions`).
// No incluye `admin.workshops.*` (permisos a nivel platform, son de sistema).
export const WORKSHOP_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    // members
    'member.invite',
    'member.role.update',
    'member.remove',
    // workshop
    'workshop.update',
    'workshop.branch.create',
    'workshop.hours.set',
    // appointments
    'appointment.create',
    'appointment.update',
    'appointment.cancel',
    // work orders
    'workorder.create',
    'workorder.close',
    'workorder.item.add',
    // estimates
    'estimate.create',
    'estimate.approve',
    'estimate.convert',
    // service records
    'service-record.create',
    // care episodes (vehicle check-in / verify owner-recorded records)
    'care-episode.create',
    'care-episode.verify',
    // history
    'history.view',
    'history.share',
  ],
  mechanic: [
    'appointment.create',
    'workorder.create',
    'workorder.close',
    'workorder.item.add',
    'estimate.create',
    'estimate.approve',
    'estimate.convert',
    'service-record.create',
    'care-episode.create',
    'care-episode.verify',
    'history.view',
  ],
  employee: ['appointment.create', 'history.view'],
};