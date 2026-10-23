import { DEFAULT_ROLES, ROLE_PERMISSIONS } from './dealerships.constants';

/**
 * Gap 1 (D-128 / §4.1): el alta de stock propio y el kilometraje inicial
 * dependen de que owner/admin/seller reciban los tres permisos nuevos. Esta
 * matriz es la que consume `PrismaDealershipRepository` al crear concesionarias
 * por app, por lo que debe coincidir con el seed `systemDealershipRolePermissions`.
 */
describe('dealerships.constants — Gap 1 (D-128)', () => {
  const GAP_1_PERMISSIONS = [
    'dealership.vehicle.create',
    'dealership.vehicle.edit',
    'dealership.mileage.record',
  ];

  it.each(DEFAULT_ROLES.map((role) => role.code))(
    'assigns the Gap 1 permissions to the %s role',
    (roleCode) => {
      expect(ROLE_PERMISSIONS[roleCode]).toEqual(
        expect.arrayContaining(GAP_1_PERMISSIONS),
      );
    },
  );

  it('defines permissions for every default role', () => {
    for (const role of DEFAULT_ROLES) {
      expect(ROLE_PERMISSIONS[role.code]).toBeDefined();
    }
  });
});
