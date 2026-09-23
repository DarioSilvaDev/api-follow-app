import {
  PrismaClient,
  SystemRoleType,
  MemberStatus,
  TransferStatus,
  OwnershipType,
  VehicleTransferEventType,
  MileageSource,
  CareEpisodeStatus,
  CareEpisodeSource,
  CareEpisodeVerification,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const permissions = [
  {
    module: 'vehicle',
    resource: 'vehicle',
    action: 'read',
    code: 'vehicle.read',
    description: 'View vehicle details',
  },
  {
    module: 'vehicle',
    resource: 'vehicle',
    action: 'update',
    code: 'vehicle.update',
    description: 'Update vehicle info',
  },
  {
    module: 'vehicle',
    resource: 'vehicle',
    action: 'transfer',
    code: 'vehicle.transfer',
    description: 'Transfer vehicle ownership',
  },
  {
    module: 'vehicle',
    resource: 'documents',
    action: 'read',
    code: 'vehicle.documents.read',
    description: 'View vehicle documents',
  },
  {
    module: 'vehicle',
    resource: 'documents',
    action: 'write',
    code: 'vehicle.documents.write',
    description: 'Add/edit vehicle documents',
  },
  {
    module: 'vehicle',
    resource: 'history',
    action: 'read',
    code: 'vehicle.history.read',
    description: 'View vehicle history',
  },
  {
    module: 'vehicle',
    resource: 'history',
    action: 'write',
    code: 'vehicle.history.write',
    description: 'Add vehicle history entries',
  },
  {
    module: 'vehicle',
    resource: 'photos',
    action: 'read',
    code: 'vehicle.photos.read',
    description: 'View vehicle photos',
  },
  {
    module: 'vehicle',
    resource: 'photos',
    action: 'write',
    code: 'vehicle.photos.write',
    description: 'Add/edit vehicle photos',
  },
  {
    module: 'vehicle',
    resource: 'share',
    action: 'create',
    code: 'vehicle.share.create',
    description: 'Create vehicle share link',
  },
  {
    module: 'vehicle',
    resource: 'share',
    action: 'revoke',
    code: 'vehicle.share.revoke',
    description: 'Revoke vehicle share link',
  },

  {
    module: 'workshop',
    resource: 'workshop',
    action: 'update',
    code: 'workshop.update',
    description: 'Update workshop settings',
  },
  {
    module: 'workshop',
    resource: 'branch',
    action: 'create',
    code: 'workshop.branch.create',
    description: 'Create workshop branch',
  },
  {
    module: 'workshop',
    resource: 'hours',
    action: 'set',
    code: 'workshop.hours.set',
    description: 'Set business hours',
  },

  {
    module: 'dealership',
    resource: 'dealership',
    action: 'create',
    code: 'dealership.create',
    description: 'Create dealership organizations',
  },
  {
    module: 'dealership',
    resource: 'dealership',
    action: 'update',
    code: 'dealership.update',
    description: 'Update dealership settings',
  },
  {
    module: 'dealership',
    resource: 'members',
    action: 'invite',
    code: 'dealership.members.invite',
    description: 'Invite new dealership members',
  },
  {
    module: 'dealership',
    resource: 'members',
    action: 'role.update',
    code: 'dealership.members.role.update',
    description: 'Change dealership member role',
  },
  {
    module: 'dealership',
    resource: 'members',
    action: 'remove',
    code: 'dealership.members.remove',
    description: 'Remove member from dealership',
  },
  {
    module: 'dealership',
    resource: 'vehicle',
    action: 'take',
    code: 'dealership.vehicle.take',
    description: 'Take a vehicle into consignment',
  },
  {
    module: 'dealership',
    resource: 'vehicle',
    action: 'sell',
    code: 'dealership.vehicle.sell',
    description: 'Sell a consigned vehicle',
  },
  {
    module: 'dealership',
    resource: 'vehicle',
    action: 'return',
    code: 'dealership.vehicle.return',
    description: 'Return a consigned vehicle',
  },

  {
    module: 'member',
    resource: 'member',
    action: 'invite',
    code: 'member.invite',
    description: 'Invite new members',
  },
  {
    module: 'member',
    resource: 'member',
    action: 'role.update',
    code: 'member.role.update',
    description: 'Change member role',
  },
  {
    module: 'member',
    resource: 'member',
    action: 'remove',
    code: 'member.remove',
    description: 'Remove member from workshop',
  },

  {
    module: 'appointment',
    resource: 'appointment',
    action: 'create',
    code: 'appointment.create',
    description: 'Create appointments',
  },
  {
    module: 'appointment',
    resource: 'appointment',
    action: 'update',
    code: 'appointment.update',
    description: 'Update appointments',
  },
  {
    module: 'appointment',
    resource: 'appointment',
    action: 'cancel',
    code: 'appointment.cancel',
    description: 'Cancel appointments',
  },

  {
    module: 'estimate',
    resource: 'estimate',
    action: 'create',
    code: 'estimate.create',
    description: 'Create estimates',
  },
  {
    module: 'estimate',
    resource: 'estimate',
    action: 'approve',
    code: 'estimate.approve',
    description: 'Approve estimates',
  },
  {
    module: 'estimate',
    resource: 'estimate',
    action: 'convert',
    code: 'estimate.convert',
    description: 'Convert an accepted estimate into a work order',
  },

  {
    module: 'service-record',
    resource: 'service-record',
    action: 'create',
    code: 'service-record.create',
    description: 'Create service records',
  },

  {
    module: 'care-episode',
    resource: 'care-episode',
    action: 'create',
    code: 'care-episode.create',
    description: 'Create care episodes (vehicle check-in)',
  },
  {
    module: 'care-episode',
    resource: 'care-episode',
    action: 'verify',
    code: 'care-episode.verify',
    description: 'Verify owner-recorded care episodes',
  },
  {
    module: 'care-episode',
    resource: 'care-episode',
    action: 'attach',
    code: 'care-episode.attach',
    description: 'Upload evidence attachments to care episodes',
  },

  {
    module: 'workorder',
    resource: 'workorder',
    action: 'create',
    code: 'workorder.create',
    description: 'Create work orders',
  },
  {
    module: 'workorder',
    resource: 'workorder',
    action: 'close',
    code: 'workorder.close',
    description: 'Close work orders',
  },
  {
    module: 'workorder',
    resource: 'item',
    action: 'add',
    code: 'workorder.item.add',
    description: 'Add items to a work order',
  },

  {
    module: 'history',
    resource: 'history',
    action: 'view',
    code: 'history.view',
    description: 'View service history',
  },
  {
    module: 'history',
    resource: 'history',
    action: 'share',
    code: 'history.share',
    description: 'Share service history',
  },

  {
    module: 'subscription',
    resource: 'subscription',
    action: 'manage',
    code: 'subscription.manage',
    description: 'Manage subscription',
  },

  {
    module: 'admin',
    resource: 'roles',
    action: 'assign',
    code: 'admin.roles.assign',
    description: 'Assign system roles to users',
  },
  {
    module: 'admin',
    resource: 'roles',
    action: 'revoke',
    code: 'admin.roles.revoke',
    description: 'Revoke system roles from users',
  },
  {
    module: 'admin',
    resource: 'roles',
    action: 'list',
    code: 'admin.roles.list',
    description: 'List system roles',
  },
  {
    module: 'admin',
    resource: 'users',
    action: 'list',
    code: 'admin.users.list',
    description: 'List users with roles',
  },
  {
    module: 'admin',
    resource: 'users',
    action: 'read',
    code: 'admin.users.read',
    description: 'View user details',
  },
  {
    module: 'admin',
    resource: 'users',
    action: 'manage',
    code: 'admin.users.manage',
    description: 'Manage user status (suspend/activate)',
  },
  {
    module: 'admin',
    resource: 'users',
    action: 'delete',
    code: 'admin.users.delete',
    description: 'Delete users',
  },
  {
    module: 'admin',
    resource: 'workshops',
    action: 'list',
    code: 'admin.workshops.list',
    description: 'List all workshops',
  },
  {
    module: 'admin',
    resource: 'workshops',
    action: 'read',
    code: 'admin.workshops.read',
    description: 'View workshop details',
  },
  {
    module: 'admin',
    resource: 'workshops',
    action: 'manage',
    code: 'admin.workshops.manage',
    description: 'Suspend/activate workshops',
  },
  {
    module: 'admin',
    resource: 'workshops',
    action: 'members',
    code: 'admin.workshops.members',
    description: 'View workshop members',
  },
  {
    module: 'admin',
    resource: 'workshops',
    action: 'create',
    code: 'admin.workshops.create',
    description: 'Create workshops (admin onboarding)',
  },
  {
    module: 'admin',
    resource: 'workshops',
    action: 'update',
    code: 'admin.workshops.update',
    description: 'Edit workshops',
  },
  {
    module: 'admin',
    resource: 'workshops',
    action: 'delete',
    code: 'admin.workshops.delete',
    description: 'Delete workshops',
  },
  {
    module: 'admin',
    resource: 'dealerships',
    action: 'create',
    code: 'admin.dealerships.create',
    description: 'Create dealerships (admin onboarding)',
  },
  {
    module: 'admin',
    resource: 'dealerships',
    action: 'list',
    code: 'admin.dealerships.list',
    description: 'List all dealerships',
  },
  {
    module: 'admin',
    resource: 'dealerships',
    action: 'read',
    code: 'admin.dealerships.read',
    description: 'View dealership details',
  },
  {
    module: 'admin',
    resource: 'dealerships',
    action: 'manage',
    code: 'admin.dealerships.manage',
    description: 'Manage dealership onboarding and invitations',
  },
  {
    module: 'admin',
    resource: 'dealerships',
    action: 'update',
    code: 'admin.dealerships.update',
    description: 'Edit dealership identity and contact fields',
  },
  {
    module: 'admin',
    resource: 'vehicles',
    action: 'list',
    code: 'admin.vehicles.list',
    description: 'List all vehicles',
  },
  {
    module: 'admin',
    resource: 'vehicles',
    action: 'read',
    code: 'admin.vehicles.read',
    description: 'View vehicle details',
  },
  {
    module: 'admin',
    resource: 'permissions',
    action: 'list',
    code: 'admin.permissions.list',
    description: 'List all permissions and view role permissions',
  },
  {
    module: 'admin',
    resource: 'permissions',
    action: 'manage',
    code: 'admin.permissions.manage',
    description: 'Modify role permissions',
  },
  {
    module: 'admin',
    resource: 'dashboard',
    action: 'view',
    code: 'admin.dashboard',
    description: 'View the platform admin dashboard',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'brands.list',
    code: 'admin.vehicle-catalog.brands.list',
    description: 'List vehicle brands',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'brands.read',
    code: 'admin.vehicle-catalog.brands.read',
    description: 'View brand details',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'brands.create',
    code: 'admin.vehicle-catalog.brands.create',
    description: 'Create vehicle brands',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'brands.update',
    code: 'admin.vehicle-catalog.brands.update',
    description: 'Update vehicle brands',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'brands.delete',
    code: 'admin.vehicle-catalog.brands.delete',
    description: 'Delete vehicle brands',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'models.list',
    code: 'admin.vehicle-catalog.models.list',
    description: 'List vehicle models',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'models.read',
    code: 'admin.vehicle-catalog.models.read',
    description: 'View model details',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'models.create',
    code: 'admin.vehicle-catalog.models.create',
    description: 'Create vehicle models',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'models.update',
    code: 'admin.vehicle-catalog.models.update',
    description: 'Update vehicle models',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'models.delete',
    code: 'admin.vehicle-catalog.models.delete',
    description: 'Delete vehicle models',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'versions.list',
    code: 'admin.vehicle-catalog.versions.list',
    description: 'List vehicle versions',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'versions.read',
    code: 'admin.vehicle-catalog.versions.read',
    description: 'View version details',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'versions.create',
    code: 'admin.vehicle-catalog.versions.create',
    description: 'Create vehicle versions',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'versions.update',
    code: 'admin.vehicle-catalog.versions.update',
    description: 'Update vehicle versions',
  },
  {
    module: 'admin',
    resource: 'vehicle-catalog',
    action: 'versions.delete',
    code: 'admin.vehicle-catalog.versions.delete',
    description: 'Delete vehicle versions',
  },
];

const systemRoles = [
  {
    type: SystemRoleType.super_admin,
    name: 'Super Admin',
    description: 'Full system access',
    priority: 100,
  },
  {
    type: SystemRoleType.admin,
    name: 'Admin',
    description: 'System administration',
    priority: 80,
  },
  {
    type: SystemRoleType.support,
    name: 'Support',
    description: 'Read-only support access',
    priority: 60,
  },
  {
    type: SystemRoleType.user,
    name: 'User',
    description: 'Regular platform user',
    priority: 0,
  },
];

const systemRolePermissions: Record<SystemRoleType, string[]> = {
  [SystemRoleType.super_admin]: permissions.map((p) => p.code),
  [SystemRoleType.admin]: [
    'admin.roles.assign',
    'admin.roles.list',
    'admin.roles.revoke',
    'admin.users.list',
    'admin.users.read',
    'admin.users.manage',
    'admin.workshops.create',
    'admin.workshops.update',
    'admin.workshops.delete',
    'admin.workshops.list',
    'admin.workshops.read',
    'admin.workshops.manage',
    'admin.workshops.members',
    'admin.dealerships.create',
    'admin.dealerships.list',
    'admin.dealerships.read',
    'admin.dealerships.manage',
    'admin.dealerships.update',
    'admin.dashboard',
    'admin.vehicle-catalog.brands.list',
    'admin.vehicle-catalog.brands.read',
    'admin.vehicle-catalog.models.list',
    'admin.vehicle-catalog.models.read',
    'admin.vehicle-catalog.versions.list',
    'admin.vehicle-catalog.versions.read',
  ],
  [SystemRoleType.support]: ['admin.users.list'],
  [SystemRoleType.user]: [],
};

/**
 * Workshop role → permission matrix for the system workshop roles created by
 * `seedWorkshops` (owner / mechanic / employee).
 *
 * This links the system workshop roles to the permission codes they are allowed
 * to exercise within a WORKSHOP context. It covers the operational permission
 * domain enforced by `PermissionsGuard` on maintenance / workshop / member
 * endpoints (D-024 A1 + Security Review items 1 & 8).
 *
 * Hierarchy (for update-member-role): owner (100) > mechanic (50) > employee (30).
 *
 * NOTE: Roles can be extended per-workshop with custom roles via
 * `create-role` / `update-role`; this matrix only establishes the system roles.
 */
const systemWorkshopRolePermissions: Record<string, string[]> = {
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
    // care episodes (vehicle check-in)
    'care-episode.create',
    // care episodes (verify owner-recorded records)
    'care-episode.verify',
    // care episodes (evidence attachments)
    'care-episode.attach',
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
    'care-episode.attach',
    'history.view',
  ],
  employee: ['appointment.create', 'history.view'],
};

/**
 * Dealership role → permission matrix for the system dealership roles created
 * by `seedDealerships` (owner / admin / seller) — RB-10.
 *
 * Links the system dealership roles to the permission codes they can exercise
 * within a DEALERSHIP context (consignment chain: take → sell / return).
 *
 * Hierarchy (for member-role changes): owner (100) > admin (60) > seller (40).
 *
 * NOTE: `dealership.create` is intentionally NOT assigned to any dealership
 * role: creating a dealership is a platform-level action (system roles only).
 */
const systemDealershipRolePermissions: Record<string, string[]> = {
  owner: [
    // dealership
    'dealership.update',
    // members
    'dealership.members.invite',
    'dealership.members.role.update',
    'dealership.members.remove',
    // consignment chain
    'dealership.vehicle.take',
    'dealership.vehicle.sell',
    'dealership.vehicle.return',
    // care episodes / vehicle history
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
    'dealership.vehicle.sell',
    'dealership.vehicle.return',
    'care-episode.create',
    'history.view',
  ],
};

async function seedPermissions() {
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }
  console.log(`  ✓ ${permissions.length} permissions seeded`);
}

async function seedSystemRoles() {
  for (const role of systemRoles) {
    await prisma.systemRole.upsert({
      where: { type: role.type },
      update: {},
      create: role,
    });
  }
  console.log(`  ✓ ${systemRoles.length} system roles seeded`);

  for (const [roleType, permissionCodes] of Object.entries(
    systemRolePermissions,
  )) {
    const role = await prisma.systemRole.findUnique({
      where: { type: roleType as SystemRoleType },
    });
    if (!role) continue;

    const perms = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    for (const perm of perms) {
      await prisma.systemRolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
    console.log(`  ✓ ${perms.length} permissions linked to ${roleType}`);
  }
}

async function seedVehicleCatalog() {
  const brandsData = [
    { name: 'Toyota' },
    { name: 'Volkswagen' },
    { name: 'Ford' },
    { name: 'Chevrolet' },
    { name: 'Fiat' },
    { name: 'Renault' },
    { name: 'Peugeot' },
    { name: 'Nissan' },
    { name: 'Honda' },
    { name: 'Mercedes-Benz' },
    { name: 'BMW' },
    { name: 'Audi' },
    { name: 'Hyundai' },
    { name: 'Kia' },
    { name: 'Jeep' },
    { name: 'Citroën' },
    { name: 'Suzuki' },
    { name: 'Mitsubishi' },
    { name: 'Chery' },
    { name: 'Ram' },
  ];

  for (const brandData of brandsData) {
    const slug = slugify(brandData.name);
    await prisma.vehicleBrand.upsert({
      where: { slug },
      update: {},
      create: { name: brandData.name, slug },
    });
  }
  console.log(`  ✓ ${brandsData.length} vehicle brands seeded`);

  const modelsData: { brandSlug: string; name: string }[] = [
    { brandSlug: 'toyota', name: 'Corolla' },
    { brandSlug: 'toyota', name: 'Hilux' },
    { brandSlug: 'toyota', name: 'RAV4' },
    { brandSlug: 'toyota', name: 'Etios' },
    { brandSlug: 'toyota', name: 'Yaris' },
    { brandSlug: 'toyota', name: 'SW4' },
    { brandSlug: 'volkswagen', name: 'Amarok' },
    { brandSlug: 'volkswagen', name: 'Gol' },
    { brandSlug: 'volkswagen', name: 'Polo' },
    { brandSlug: 'volkswagen', name: 'Taos' },
    { brandSlug: 'volkswagen', name: 'T-Cross' },
    { brandSlug: 'volkswagen', name: 'Vento' },
    { brandSlug: 'ford', name: 'Ranger' },
    { brandSlug: 'ford', name: 'Focus' },
    { brandSlug: 'ford', name: 'F-150' },
    { brandSlug: 'ford', name: 'Territory' },
    { brandSlug: 'ford', name: 'Mustang' },
    { brandSlug: 'chevrolet', name: 'Cruze' },
    { brandSlug: 'chevrolet', name: 'Traverse' },
    { brandSlug: 'chevrolet', name: 'S10' },
    { brandSlug: 'chevrolet', name: 'Onix' },
    { brandSlug: 'chevrolet', name: 'Tracker' },
    { brandSlug: 'fiat', name: 'Cronos' },
    { brandSlug: 'fiat', name: 'Pulse' },
    { brandSlug: 'fiat', name: 'Strada' },
    { brandSlug: 'fiat', name: 'Toro' },
    { brandSlug: 'renault', name: 'Sandero' },
    { brandSlug: 'renault', name: 'Kwid' },
    { brandSlug: 'renault', name: 'Alaskan' },
    { brandSlug: 'renault', name: 'Duster' },
    { brandSlug: 'peugeot', name: '208' },
    { brandSlug: 'peugeot', name: '2008' },
    { brandSlug: 'peugeot', name: 'Partner' },
    { brandSlug: 'peugeot', name: 'Expert' },
    { brandSlug: 'nissan', name: 'Frontier' },
    { brandSlug: 'nissan', name: 'Sentra' },
    { brandSlug: 'nissan', name: 'Kicks' },
    { brandSlug: 'nissan', name: 'Versa' },
    { brandSlug: 'honda', name: 'Civic' },
    { brandSlug: 'honda', name: 'CR-V' },
    { brandSlug: 'honda', name: 'HR-V' },
  ];

  for (const modelData of modelsData) {
    const brand = await prisma.vehicleBrand.findUnique({
      where: { slug: modelData.brandSlug },
    });
    if (!brand) continue;
    const slug = slugify(modelData.name);
    await prisma.vehicleModel.upsert({
      where: { brandId_slug: { brandId: brand.id, slug } },
      update: {},
      create: { brandId: brand.id, name: modelData.name, slug },
    });
  }
  console.log(`  ✓ ${modelsData.length} vehicle models seeded`);

  const toyota = await prisma.vehicleBrand.findUnique({
    where: { slug: 'toyota' },
  });
  const vw = await prisma.vehicleBrand.findUnique({
    where: { slug: 'volkswagen' },
  });
  const ford = await prisma.vehicleBrand.findUnique({
    where: { slug: 'ford' },
  });

  async function getModelId(brandSlug: string, modelName: string) {
    const brand = await prisma.vehicleBrand.findUnique({
      where: { slug: brandSlug },
    });
    if (!brand) return null;
    const model = await prisma.vehicleModel.findUnique({
      where: { brandId_slug: { brandId: brand.id, slug: slugify(modelName) } },
    });
    return model?.id ?? null;
  }

  const corollaId = await getModelId('toyota', 'Corolla');
  const hiluxId = await getModelId('toyota', 'Hilux');
  const amarokId = await getModelId('volkswagen', 'Amarok');
  const rangerId = await getModelId('ford', 'Ranger');

  if (corollaId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000001',
        modelId: corollaId,
        name: '1.8 XLI',
        fuelType: 'gasoline',
        transmission: 'manual',
        bodyType: 'sedan',
        doors: 4,
        engineDisplacement: 1800,
        horsepower: 140,
      },
    });
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000002',
        modelId: corollaId,
        name: '1.8 XLI CVT',
        fuelType: 'gasoline',
        transmission: 'cvt',
        bodyType: 'sedan',
        doors: 4,
        engineDisplacement: 1800,
        horsepower: 140,
      },
    });
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000003',
        modelId: corollaId,
        name: '2.0 SE-G CVT',
        fuelType: 'gasoline',
        transmission: 'cvt',
        bodyType: 'sedan',
        doors: 4,
        engineDisplacement: 2000,
        horsepower: 170,
      },
    });
  }

  if (hiluxId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000004' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000004',
        modelId: hiluxId,
        name: '2.4 TD SRV 4x4',
        fuelType: 'diesel',
        transmission: 'manual',
        bodyType: 'pickup',
        doors: 4,
        engineDisplacement: 2400,
        horsepower: 150,
      },
    });
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000005' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000005',
        modelId: hiluxId,
        name: '2.8 TD SRX 4x4 AT',
        fuelType: 'diesel',
        transmission: 'automatic',
        bodyType: 'pickup',
        doors: 4,
        engineDisplacement: 2800,
        horsepower: 204,
      },
    });
  }

  if (amarokId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000006' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000006',
        modelId: amarokId,
        name: '2.0 TD Trendline 4x2',
        fuelType: 'diesel',
        transmission: 'manual',
        bodyType: 'pickup',
        doors: 4,
        engineDisplacement: 2000,
        horsepower: 140,
      },
    });
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000007' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000007',
        modelId: amarokId,
        name: '3.0 V6 TD Highline 4x4 AT',
        fuelType: 'diesel',
        transmission: 'automatic',
        bodyType: 'pickup',
        doors: 4,
        engineDisplacement: 3000,
        horsepower: 258,
      },
    });
  }

  if (rangerId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000008' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000008',
        modelId: rangerId,
        name: '2.2 TD XL 4x2',
        fuelType: 'diesel',
        transmission: 'manual',
        bodyType: 'pickup',
        doors: 4,
        engineDisplacement: 2200,
        horsepower: 125,
      },
    });
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000009' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000009',
        modelId: rangerId,
        name: '3.2 TD XLT 4x4 AT',
        fuelType: 'diesel',
        transmission: 'automatic',
        bodyType: 'pickup',
        doors: 4,
        engineDisplacement: 3200,
        horsepower: 200,
      },
    });
  }

  // ── Versiones adicionales (idempotente por id v4 fijo, mismo patrón que
  //    las 9 originales). Cubren las marcas de las concesionarias reales del
  //    seed (Ford↔Giorgi, Chevrolet↔Fortecar, VW↔Pesado Castro) y un mix de
  //    multimarcas. Todas referencian modelos ya creados más arriba. ──
  const cheeru = await getModelId('chevrolet', 'Cruze');
  if (cheeru) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000010' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000010',
        modelId: cheeru,
        name: '1.4 TURBO LTZ',
        fuelType: 'gasoline',
        transmission: 'automatic',
        bodyType: 'sedan',
        doors: 4,
        engineDisplacement: 1400,
        horsepower: 153,
      },
    });
  }

  const s10Id = await getModelId('chevrolet', 'S10');
  if (s10Id) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000011' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000011',
        modelId: s10Id,
        name: '2.8 TD LTZ 4x4',
        fuelType: 'diesel',
        transmission: 'automatic',
        bodyType: 'pickup',
        doors: 4,
        engineDisplacement: 2800,
        horsepower: 200,
      },
    });
  }

  const onixId = await getModelId('chevrolet', 'Onix');
  if (onixId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000012' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000012',
        modelId: onixId,
        name: '1.2 TURBO LTZ',
        fuelType: 'gasoline',
        transmission: 'automatic',
        bodyType: 'hatchback',
        doors: 5,
        engineDisplacement: 1200,
        horsepower: 116,
      },
    });
  }

  const golId = await getModelId('volkswagen', 'Gol');
  if (golId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000013' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000013',
        modelId: golId,
        name: '1.6 MSI',
        fuelType: 'gasoline',
        transmission: 'manual',
        bodyType: 'hatchback',
        doors: 5,
        engineDisplacement: 1600,
        horsepower: 110,
      },
    });
  }

  const poloId = await getModelId('volkswagen', 'Polo');
  if (poloId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000014' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000014',
        modelId: poloId,
        name: '1.6 MSI',
        fuelType: 'gasoline',
        transmission: 'manual',
        bodyType: 'hatchback',
        doors: 5,
        engineDisplacement: 1600,
        horsepower: 110,
      },
    });
  }

  const taosId = await getModelId('volkswagen', 'Taos');
  if (taosId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000015' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000015',
        modelId: taosId,
        name: '1.4 TSI 250',
        fuelType: 'gasoline',
        transmission: 'automatic',
        bodyType: 'suv',
        doors: 5,
        engineDisplacement: 1400,
        horsepower: 150,
      },
    });
  }

  const focusId = await getModelId('ford', 'Focus');
  if (focusId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000016' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000016',
        modelId: focusId,
        name: '2.0 TI-VCT',
        fuelType: 'gasoline',
        transmission: 'manual',
        bodyType: 'hatchback',
        doors: 5,
        engineDisplacement: 2000,
        horsepower: 170,
      },
    });
  }

  const rav4Id = await getModelId('toyota', 'RAV4');
  if (rav4Id) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000017' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000017',
        modelId: rav4Id,
        name: '2.0 XLE CVT',
        fuelType: 'gasoline',
        transmission: 'cvt',
        bodyType: 'suv',
        doors: 5,
        engineDisplacement: 2000,
        horsepower: 173,
      },
    });
  }

  const cronosId = await getModelId('fiat', 'Cronos');
  if (cronosId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000018' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000018',
        modelId: cronosId,
        name: '1.8 EVO',
        fuelType: 'gasoline',
        transmission: 'manual',
        bodyType: 'sedan',
        doors: 4,
        engineDisplacement: 1800,
        horsepower: 130,
      },
    });
  }

  const sanderoId = await getModelId('renault', 'Sandero');
  if (sanderoId) {
    await prisma.vehicleVersion.upsert({
      where: { id: '00000000-0000-4000-8000-000000000019' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000019',
        modelId: sanderoId,
        name: '1.6 SCe',
        fuelType: 'gasoline',
        transmission: 'manual',
        bodyType: 'hatchback',
        doors: 5,
        engineDisplacement: 1600,
        horsepower: 115,
      },
    });
  }

  const versionCount = await prisma.vehicleVersion.count();
  console.log(`  ✓ ${versionCount} vehicle versions seeded`);
}

async function seedUsers() {
  const password = await bcrypt.hash('Seeder123!', 10);

  // R1 (PM): el seed ya NO crea usuarios con rol system `admin` ni `support`.
  // Solo 1 super_admin (super@admin.com) + usuarios `user`. Los admin/support
  // existentes en DBs de desarrollo NO se borran (acción no destructiva); el
  // seed simplemente deja de crearlos.
  const usersData = [
    {
      email: 'super@admin.com',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
    },
    {
      email: 'user1@seeder.com',
      firstName: 'Facundo',
      lastName: 'Álvarez',
      role: 'user',
    },
    {
      email: 'user2@seeder.com',
      firstName: 'Camila',
      lastName: 'Sosa',
      role: 'user',
    },
    {
      email: 'user3@seeder.com',
      firstName: 'Nicolás',
      lastName: 'Castillo',
      role: 'user',
    },
    {
      email: 'user4@seeder.com',
      firstName: 'Valentina',
      lastName: 'Pereyra',
      role: 'user',
    },
    {
      email: 'user5@seeder.com',
      firstName: 'Santiago',
      lastName: 'Rivas',
      role: 'user',
    },
    {
      email: 'user6@seeder.com',
      firstName: 'Florencia',
      lastName: 'Molina',
      role: 'user',
    },
    {
      email: 'user7@seeder.com',
      firstName: 'Matías',
      lastName: 'Acosta',
      role: 'user',
    },
    {
      email: 'user8@seeder.com',
      firstName: 'Julieta',
      lastName: 'Silva',
      role: 'user',
    },
    {
      email: 'user9@seeder.com',
      firstName: 'Ignacio',
      lastName: 'Cruz',
      role: 'user',
    },
    {
      email: 'user10@seeder.com',
      firstName: 'Luciana',
      lastName: 'Vega',
      role: 'user',
    },
    {
      email: 'user11@seeder.com',
      firstName: 'Agustín',
      lastName: 'Medina',
      role: 'user',
    },
    {
      email: 'user12@seeder.com',
      firstName: 'Martina',
      lastName: 'Rojas',
      role: 'user',
    },
    {
      email: 'user13@seeder.com',
      firstName: 'Tomás',
      lastName: 'Campos',
      role: 'user',
    },
    {
      email: 'user14@seeder.com',
      firstName: 'Isabella',
      lastName: 'Herrera',
      role: 'user',
    },
    {
      email: 'user15@seeder.com',
      firstName: 'Benjamín',
      lastName: 'Suárez',
      role: 'user',
    },
    {
      email: 'user16@seeder.com',
      firstName: 'Emilia',
      lastName: 'Giménez',
      role: 'user',
    },
    {
      email: 'user17@seeder.com',
      firstName: 'Joaquín',
      lastName: 'Ruiz',
      role: 'user',
    },
    {
      email: 'user18@seeder.com',
      firstName: 'Catalina',
      lastName: 'Navarro',
      role: 'user',
    },
    {
      email: 'user19@seeder.com',
      firstName: 'Felipe',
      lastName: 'Méndez',
      role: 'user',
    },
    {
      email: 'user20@seeder.com',
      firstName: 'Victoria',
      lastName: 'Arias',
      role: 'user',
    },
    {
      email: 'user21@seeder.com',
      firstName: 'Franco',
      lastName: 'Flores',
      role: 'user',
    },
    {
      email: 'user22@seeder.com',
      firstName: 'Renata',
      lastName: 'Paz',
      role: 'user',
    },
    {
      email: 'user23@seeder.com',
      firstName: 'Bruno',
      lastName: 'Costa',
      role: 'user',
    },
    {
      email: 'user24@seeder.com',
      firstName: 'Zoe',
      lastName: 'Ferrari',
      role: 'user',
    },
    {
      email: 'user25@seeder.com',
      firstName: 'Emmanuel',
      lastName: 'Delgado',
      role: 'user',
    },
    {
      email: 'user26@seeder.com',
      firstName: 'Morena',
      lastName: 'Villalba',
      role: 'user',
    },
    {
      email: 'user27@seeder.com',
      firstName: 'Maximiliano',
      lastName: 'Godoy',
      role: 'user',
    },
    {
      email: 'user28@seeder.com',
      firstName: 'Alma',
      lastName: 'Roldán',
      role: 'user',
    },
    {
      email: 'user29@seeder.com',
      firstName: 'Thiago',
      lastName: 'Ponce',
      role: 'user',
    },
    {
      email: 'user30@seeder.com',
      firstName: 'Guadalupe',
      lastName: 'Miranda',
      role: 'user',
    },
    {
      email: 'user31@seeder.com',
      firstName: 'Bautista',
      lastName: 'Escobar',
      role: 'user',
    },
    {
      email: 'user32@seeder.com',
      firstName: 'Malena',
      lastName: 'Coronel',
      role: 'user',
    },
    {
      email: 'user33@seeder.com',
      firstName: 'Manuel',
      lastName: 'Ávila',
      role: 'user',
    },
    {
      email: 'user34@seeder.com',
      firstName: 'Delfina',
      lastName: 'Lucero',
      role: 'user',
    },
    {
      email: 'user35@seeder.com',
      firstName: 'Francisco',
      lastName: 'Carrizo',
      role: 'user',
    },
    {
      email: 'user36@seeder.com',
      firstName: 'Candelaria',
      lastName: 'Quiroga',
      role: 'user',
    },
    {
      email: 'user37@seeder.com',
      firstName: 'Gonzalo',
      lastName: 'Barrios',
      role: 'user',
    },
    {
      email: 'user38@seeder.com',
      firstName: 'Pilar',
      lastName: 'Ojeda',
      role: 'user',
    },
    {
      email: 'user39@seeder.com',
      firstName: 'Lautaro',
      lastName: 'Cáceres',
      role: 'user',
    },
    {
      email: 'user40@seeder.com',
      firstName: 'Antonia',
      lastName: 'Bustos',
      role: 'user',
    },
    // ── Personas reales de negocio (R2 / R3 / R4): gerentes de
    //    concesionarias y dueños de talleres. Son usuarios `user` comunes. ──
    {
      email: 'user41@seeder.com',
      firstName: 'Fernando',
      lastName: 'Mansilla',
      role: 'user',
    },
    {
      email: 'user42@seeder.com',
      firstName: 'Matías',
      lastName: 'Corrales',
      role: 'user',
    },
    {
      email: 'user43@seeder.com',
      firstName: 'Marcos',
      lastName: 'Giordano',
      role: 'user',
    },
    {
      email: 'user44@seeder.com',
      firstName: 'Esteban',
      lastName: 'Forte',
      role: 'user',
    },
    {
      email: 'user45@seeder.com',
      firstName: 'Hugo',
      lastName: 'Castro',
      role: 'user',
    },
    {
      email: 'user46@seeder.com',
      firstName: 'Juan Carlos',
      lastName: 'Godoy',
      role: 'user',
    },
    {
      email: 'user47@seeder.com',
      firstName: 'Francisco',
      lastName: 'Molina',
      role: 'user',
    },
    {
      email: 'user48@seeder.com',
      firstName: 'Rubén',
      lastName: 'Silva',
      role: 'user',
    },
    {
      email: 'user49@seeder.com',
      firstName: 'Oscar',
      lastName: 'Medina',
      role: 'user',
    },
    {
      email: 'user50@seeder.com',
      firstName: 'Claudio',
      lastName: 'Vega',
      role: 'user',
    },
    {
      email: 'user51@seeder.com',
      firstName: 'Héctor',
      lastName: 'Ríos',
      role: 'user',
    },
    {
      email: 'user52@seeder.com',
      firstName: 'Darío',
      lastName: 'Luna',
      role: 'user',
    },
    {
      email: 'user53@seeder.com',
      firstName: 'Sergio',
      lastName: 'Acosta',
      role: 'user',
    },
    {
      email: 'user54@seeder.com',
      firstName: 'Marcelo',
      lastName: 'Pereyra',
      role: 'user',
    },
    {
      email: 'user55@seeder.com',
      firstName: 'Gustavo',
      lastName: 'Sosa',
      role: 'user',
    },
    {
      email: 'user56@seeder.com',
      firstName: 'Adrián',
      lastName: 'Paz',
      role: 'user',
    },
    {
      email: 'user57@seeder.com',
      firstName: 'Pablo',
      lastName: 'Quiroga',
      role: 'user',
    },
    {
      email: 'user58@seeder.com',
      firstName: 'Ramón',
      lastName: 'Herrera',
      role: 'user',
    },
    {
      email: 'user59@seeder.com',
      firstName: 'Jorge',
      lastName: 'Barrios',
      role: 'user',
    },
    {
      email: 'user60@seeder.com',
      firstName: 'Andrés',
      lastName: 'Flores',
      role: 'user',
    },
    {
      email: 'user61@seeder.com',
      firstName: 'Nicolás',
      lastName: 'Roldán',
      role: 'user',
    },
    {
      email: 'user62@seeder.com',
      firstName: 'Martín',
      lastName: 'Corvalán',
      role: 'user',
    },
    {
      email: 'user63@seeder.com',
      firstName: 'Diego',
      lastName: 'Fuentes',
      role: 'user',
    },
    {
      email: 'user64@seeder.com',
      firstName: 'Ezequiel',
      lastName: 'Peralta',
      role: 'user',
    },
    {
      email: 'user65@seeder.com',
      firstName: 'Saúl',
      lastName: 'Villalba',
      role: 'user',
    },
    // ── Propietarios de vehículos (20): owner01..owner20. Son usuarios
    //    `user` del seed, con vehículos asignados (seedVehicles). Sin
    //    membresías en talleres/concesionarias (identidad limpia). ──
    { email: 'owner01@seeder.com', firstName: 'Martín', lastName: 'Aguirre', role: 'user' },
    { email: 'owner02@seeder.com', firstName: 'Lucía', lastName: 'Benítez', role: 'user' },
    { email: 'owner03@seeder.com', firstName: 'Rodrigo', lastName: 'Cabral', role: 'user' },
    { email: 'owner04@seeder.com', firstName: 'Paula', lastName: 'Duarte', role: 'user' },
    { email: 'owner05@seeder.com', firstName: 'Iván', lastName: 'Espinoza', role: 'user' },
    { email: 'owner06@seeder.com', firstName: 'Carla', lastName: 'Ferreyra', role: 'user' },
    { email: 'owner07@seeder.com', firstName: 'Diego', lastName: 'Giménez', role: 'user' },
    { email: 'owner08@seeder.com', firstName: 'Sofía', lastName: 'Herrera', role: 'user' },
    { email: 'owner09@seeder.com', firstName: 'Julián', lastName: 'Ibarra', role: 'user' },
    { email: 'owner10@seeder.com', firstName: 'Natalia', lastName: 'Juárez', role: 'user' },
    { email: 'owner11@seeder.com', firstName: 'Pablo', lastName: 'Kessler', role: 'user' },
    { email: 'owner12@seeder.com', firstName: 'Romina', lastName: 'Ledesma', role: 'user' },
    { email: 'owner13@seeder.com', firstName: 'Gastón', lastName: 'Márquez', role: 'user' },
    { email: 'owner14@seeder.com', firstName: 'Eugenia', lastName: 'Niembro', role: 'user' },
    { email: 'owner15@seeder.com', firstName: 'Hernán', lastName: 'Orellana', role: 'user' },
    { email: 'owner16@seeder.com', firstName: 'Valeria', lastName: 'Paredes', role: 'user' },
    { email: 'owner17@seeder.com', firstName: 'Sergio', lastName: 'Quinteros', role: 'user' },
    { email: 'owner18@seeder.com', firstName: 'Mariana', lastName: 'Romero', role: 'user' },
    { email: 'owner19@seeder.com', firstName: 'Leonardo', lastName: 'Sánchez', role: 'user' },
    { email: 'owner20@seeder.com', firstName: 'Gimena', lastName: 'Torre', role: 'user' },
    // ── Personas de concesionarias (16): dueños/gerentes + admins + sellers. ──
    { email: 'fm-owner@seeder.com', firstName: 'Fernando', lastName: 'Mansilla', role: 'user' },
    { email: 'matias-owner@seeder.com', firstName: 'Matías', lastName: 'Corrales', role: 'user' },
    { email: 'giorgi-gerente@seeder.com', firstName: 'Marcos', lastName: 'Giordano', role: 'user' },
    { email: 'fortecar-gerente@seeder.com', firstName: 'Esteban', lastName: 'Forte', role: 'user' },
    { email: 'castro-gerente@seeder.com', firstName: 'Hugo', lastName: 'Castro', role: 'user' },
    { email: 'fm-seller1@seeder.com', firstName: 'Nicolás', lastName: 'Berón', role: 'user' },
    { email: 'matias-seller1@seeder.com', firstName: 'Julieta', lastName: 'Paz', role: 'user' },
    { email: 'giorgi-admin@seeder.com', firstName: 'Ivana', lastName: 'Ríos', role: 'user' },
    { email: 'giorgi-seller1@seeder.com', firstName: 'Facundo', lastName: 'León', role: 'user' },
    { email: 'giorgi-seller2@seeder.com', firstName: 'Milagros', lastName: 'Tapia', role: 'user' },
    { email: 'fortecar-admin@seeder.com', firstName: 'Damián', lastName: 'Vega', role: 'user' },
    { email: 'fortecar-seller1@seeder.com', firstName: 'Camila', lastName: 'Roldán', role: 'user' },
    { email: 'fortecar-seller2@seeder.com', firstName: 'Sebastián', lastName: 'Moyano', role: 'user' },
    { email: 'castro-admin@seeder.com', firstName: 'Patricia', lastName: 'Oliva', role: 'user' },
    { email: 'castro-seller1@seeder.com', firstName: 'Héctor', lastName: 'Salas', role: 'user' },
    { email: 'castro-seller2@seeder.com', firstName: 'Julia', lastName: 'Cabrera', role: 'user' },
    // ── Dueños de talleres independientes (20): w01-owner..w20-owner. ──
    { email: 'w01-owner@seeder.com', firstName: 'Jorge', lastName: 'Vera', role: 'user' },
    { email: 'w02-owner@seeder.com', firstName: 'Raúl', lastName: 'Campos', role: 'user' },
    { email: 'w03-owner@seeder.com', firstName: 'Omar', lastName: 'Ibarra', role: 'user' },
    { email: 'w04-owner@seeder.com', firstName: 'Néstor', lastName: 'Durán', role: 'user' },
    { email: 'w05-owner@seeder.com', firstName: 'Alberto', lastName: 'Molina', role: 'user' },
    { email: 'w06-owner@seeder.com', firstName: 'Claudio', lastName: 'Ruiz', role: 'user' },
    { email: 'w07-owner@seeder.com', firstName: 'Fabián', lastName: 'Soto', role: 'user' },
    { email: 'w08-owner@seeder.com', firstName: 'Alfredo', lastName: 'Peña', role: 'user' },
    { email: 'w09-owner@seeder.com', firstName: 'Mauricio', lastName: 'Lara', role: 'user' },
    { email: 'w10-owner@seeder.com', firstName: 'Antonio', lastName: 'Gil', role: 'user' },
    { email: 'w11-owner@seeder.com', firstName: 'Germán', lastName: 'Bustos', role: 'user' },
    { email: 'w12-owner@seeder.com', firstName: 'Ricardo', lastName: 'Ortiz', role: 'user' },
    { email: 'w13-owner@seeder.com', firstName: 'Enrique', lastName: 'Salas', role: 'user' },
    { email: 'w14-owner@seeder.com', firstName: 'Walter', lastName: 'Méndez', role: 'user' },
    { email: 'w15-owner@seeder.com', firstName: 'César', lastName: 'Luna', role: 'user' },
    { email: 'w16-owner@seeder.com', firstName: 'Hernán', lastName: 'Prieto', role: 'user' },
    { email: 'w17-owner@seeder.com', firstName: 'Simón', lastName: 'Rojas', role: 'user' },
    { email: 'w18-owner@seeder.com', firstName: 'Edgardo', lastName: 'Paz', role: 'user' },
    { email: 'w19-owner@seeder.com', firstName: 'Rubén', lastName: 'Coria', role: 'user' },
    { email: 'w20-owner@seeder.com', firstName: 'Adrián', lastName: 'Tello', role: 'user' },
    // ── Trabajadores de talleres independientes (42): wXX-mecN / wXX-empN.
    //    Cada trabajador pertenece a UN solo taller (emails únicos). ──
    // Talleres con 4 members (w01-w08): mec1, mec2, emp1
    { email: 'w01-mec1@seeder.com', firstName: 'Leonardo', lastName: 'Benítez', role: 'user' },
    { email: 'w01-mec2@seeder.com', firstName: 'Cristian', lastName: 'Díaz', role: 'user' },
    { email: 'w01-emp1@seeder.com', firstName: 'Nadia', lastName: 'Flores', role: 'user' },
    { email: 'w02-mec1@seeder.com', firstName: 'Rodrigo', lastName: 'Ávalos', role: 'user' },
    { email: 'w02-mec2@seeder.com', firstName: 'Patricio', lastName: 'Vega', role: 'user' },
    { email: 'w02-emp1@seeder.com', firstName: 'Brenda', lastName: 'Luna', role: 'user' },
    { email: 'w03-mec1@seeder.com', firstName: 'Maximiliano', lastName: 'Ríos', role: 'user' },
    { email: 'w03-mec2@seeder.com', firstName: 'Ezequiel', lastName: 'Paz', role: 'user' },
    { email: 'w03-emp1@seeder.com', firstName: 'Lara', lastName: 'Molina', role: 'user' },
    { email: 'w04-mec1@seeder.com', firstName: 'Federico', lastName: 'López', role: 'user' },
    { email: 'w04-mec2@seeder.com', firstName: 'Gabriel', lastName: 'Sosa', role: 'user' },
    { email: 'w04-emp1@seeder.com', firstName: 'Melina', lastName: 'Ortiz', role: 'user' },
    { email: 'w05-mec1@seeder.com', firstName: 'Renzo', lastName: 'Acuña', role: 'user' },
    { email: 'w05-mec2@seeder.com', firstName: 'Iván', lastName: 'Moral', role: 'user' },
    { email: 'w05-emp1@seeder.com', firstName: 'Flavia', lastName: 'Ríos', role: 'user' },
    { email: 'w06-mec1@seeder.com', firstName: 'Agustín', lastName: 'Farias', role: 'user' },
    { email: 'w06-mec2@seeder.com', firstName: 'Tomás', lastName: 'Roca', role: 'user' },
    { email: 'w06-emp1@seeder.com', firstName: 'Verónica', lastName: 'Gil', role: 'user' },
    { email: 'w07-mec1@seeder.com', firstName: 'Nahuel', lastName: 'Vera', role: 'user' },
    { email: 'w07-mec2@seeder.com', firstName: 'Lautaro', lastName: 'Cejas', role: 'user' },
    { email: 'w07-emp1@seeder.com', firstName: 'Rocío', lastName: 'Salas', role: 'user' },
    { email: 'w08-mec1@seeder.com', firstName: 'Bruno', lastName: 'Mansilla', role: 'user' },
    { email: 'w08-mec2@seeder.com', firstName: 'Thiago', lastName: 'Pérez', role: 'user' },
    { email: 'w08-emp1@seeder.com', firstName: 'Abril', lastName: 'Torres', role: 'user' },
    // Talleres con 3 members (w09-w14): mec1, emp1
    { email: 'w09-mec1@seeder.com', firstName: 'Franco', lastName: 'Roldán', role: 'user' },
    { email: 'w09-emp1@seeder.com', firstName: 'Zoe', lastName: 'Luna', role: 'user' },
    { email: 'w10-mec1@seeder.com', firstName: 'Joaquín', lastName: 'Molina', role: 'user' },
    { email: 'w10-emp1@seeder.com', firstName: 'Delfina', lastName: 'Paz', role: 'user' },
    { email: 'w11-mec1@seeder.com', firstName: 'Matías', lastName: 'Roca', role: 'user' },
    { email: 'w11-emp1@seeder.com', firstName: 'Pilar', lastName: 'Méndez', role: 'user' },
    { email: 'w12-mec1@seeder.com', firstName: 'Ignacio', lastName: 'Bravo', role: 'user' },
    { email: 'w12-emp1@seeder.com', firstName: 'Camila', lastName: 'Ortiz', role: 'user' },
    { email: 'w13-mec1@seeder.com', firstName: 'Santiago', lastName: 'Freire', role: 'user' },
    { email: 'w13-emp1@seeder.com', firstName: 'Valentina', lastName: 'Ruiz', role: 'user' },
    { email: 'w14-mec1@seeder.com', firstName: 'Emiliano', lastName: 'Castro', role: 'user' },
    { email: 'w14-emp1@seeder.com', firstName: 'Agustina', lastName: 'Vega', role: 'user' },
    // Talleres con 2 members (w15-w20): mec1
    { email: 'w15-mec1@seeder.com', firstName: 'Ramiro', lastName: 'Gil', role: 'user' },
    { email: 'w16-mec1@seeder.com', firstName: 'Alan', lastName: 'Sosa', role: 'user' },
    { email: 'w17-mec1@seeder.com', firstName: 'Kevin', lastName: 'Acosta', role: 'user' },
    { email: 'w18-mec1@seeder.com', firstName: 'Marcos', lastName: 'Luna', role: 'user' },
    { email: 'w19-mec1@seeder.com', firstName: 'Brian', lastName: 'Torres', role: 'user' },
    { email: 'w20-mec1@seeder.com', firstName: 'Alexis', lastName: 'Roldán', role: 'user' },
    // ── Trabajadores de services oficiales (6): 2 por service. ──
    { email: 'giorgi-svc-mec1@seeder.com', firstName: 'César', lastName: 'Domínguez', role: 'user' },
    { email: 'giorgi-svc-mec2@seeder.com', firstName: 'Hugo', lastName: 'Mansilla', role: 'user' },
    { email: 'fortecar-svc-mec1@seeder.com', firstName: 'Néstor', lastName: 'Cabrera', role: 'user' },
    { email: 'fortecar-svc-mec2@seeder.com', firstName: 'Julio', lastName: 'Vera', role: 'user' },
    { email: 'castro-svc-mec1@seeder.com', firstName: 'Omar', lastName: 'López', role: 'user' },
    { email: 'castro-svc-mec2@seeder.com', firstName: 'Raúl', lastName: 'Giménez', role: 'user' },
  ];

  for (const u of usersData) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
    });
    if (existing) continue;

    const user = await prisma.user.create({
      data: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        status: 'active',
        emailVerifiedAt: new Date(),
        credential: { create: { passwordHash: password } },
      },
    });

    const role = await prisma.systemRole.findUnique({
      where: { type: u.role as SystemRoleType },
    });
    if (role) {
      await prisma.systemRoleAssignment.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
  }

  const count = await prisma.user.count();
  console.log(`  ✓ ${count} users seeded (password: Seeder123!)`);
}

// Mapa code-de-taller → taxId, compartido entre seedWorkshops y
// seedWorkshopSpecialties (los talleres son idempotentes por taxId).
const workshopTaxIds: Record<string, string> = {
  w01: '30-72010011-5',
  w02: '30-72010012-2',
  w03: '30-72010013-9',
  w04: '30-72010014-6',
  w05: '30-72010015-3',
  w06: '30-72010016-0',
  w07: '30-72010017-7',
  w08: '30-72010018-4',
  w09: '30-72010019-1',
  w10: '30-72010020-8',
  w11: '30-72010021-5',
  w12: '30-72010022-2',
  w13: '30-72010023-9',
  w14: '30-72010024-6',
  w15: '30-72010025-3',
  w16: '30-72010026-0',
  w17: '30-72010027-7',
  w18: '30-72010028-4',
  w19: '30-72010029-1',
  w20: '30-72010030-8',
  'giorgi-svc': '30-72010031-5',
  'fortecar-svc': '30-72010032-2',
  'castro-svc': '30-72010033-9',
};

async function seedWorkshops() {
  // 20 talleres independientes (w01..w20) + 3 services oficiales de las
  // concesionarias (nombre nominal; NO hay FK Workshop→Dealership —
  // DECISIÓN DE ARQUITECTURA PENDIENTE). Cada taller usa emails de miembros
  // EXACTOS (definidos en seedUsers), sin pool reutilizable entre talleres.
  // Talleres independientes (8×4 members, 6×3 members, 6×2 members)
  const workshopsData = [
    { code: 'w01', name: 'Autoservice El Motor', taxId: '30-72010011-5', ownerEmail: 'w01-owner@seeder.com', members: ['w01-mec1@seeder.com', 'w01-mec2@seeder.com', 'w01-emp1@seeder.com'], city: 'CABA' },
    { code: 'w02', name: 'Taller San Nicolás', taxId: '30-72010012-2', ownerEmail: 'w02-owner@seeder.com', members: ['w02-mec1@seeder.com', 'w02-mec2@seeder.com', 'w02-emp1@seeder.com'], city: 'San Nicolás' },
    { code: 'w03', name: 'Chapa y Pintura Rivadavia', taxId: '30-72010013-9', ownerEmail: 'w03-owner@seeder.com', members: ['w03-mec1@seeder.com', 'w03-mec2@seeder.com', 'w03-emp1@seeder.com'], city: 'Avellaneda' },
    { code: 'w04', name: 'Mecánica del Sur', taxId: '30-72010014-6', ownerEmail: 'w04-owner@seeder.com', members: ['w04-mec1@seeder.com', 'w04-mec2@seeder.com', 'w04-emp1@seeder.com'], city: 'La Plata' },
    { code: 'w05', name: 'Taller Diesel Center', taxId: '30-72010015-3', ownerEmail: 'w05-owner@seeder.com', members: ['w05-mec1@seeder.com', 'w05-mec2@seeder.com', 'w05-emp1@seeder.com'], city: 'Quilmes' },
    { code: 'w06', name: 'Electromecánica Central', taxId: '30-72010016-0', ownerEmail: 'w06-owner@seeder.com', members: ['w06-mec1@seeder.com', 'w06-mec2@seeder.com', 'w06-emp1@seeder.com'], city: 'CABA' },
    { code: 'w07', name: 'Transmisiones Martínez', taxId: '30-72010017-7', ownerEmail: 'w07-owner@seeder.com', members: ['w07-mec1@seeder.com', 'w07-mec2@seeder.com', 'w07-emp1@seeder.com'], city: 'Morón' },
    { code: 'w08', name: 'Frenos y Alineación Elite', taxId: '30-72010018-4', ownerEmail: 'w08-owner@seeder.com', members: ['w08-mec1@seeder.com', 'w08-mec2@seeder.com', 'w08-emp1@seeder.com'], city: 'Lanús' },
    { code: 'w09', name: 'Taller Automotriz Belgrano', taxId: '30-72010019-1', ownerEmail: 'w09-owner@seeder.com', members: ['w09-mec1@seeder.com', 'w09-emp1@seeder.com'], city: 'CABA' },
    { code: 'w10', name: 'Mecánica Rápida 24hs', taxId: '30-72010020-8', ownerEmail: 'w10-owner@seeder.com', members: ['w10-mec1@seeder.com', 'w10-emp1@seeder.com'], city: 'San Martín' },
    { code: 'w11', name: 'Inyección Electrónica Pro', taxId: '30-72010021-5', ownerEmail: 'w11-owner@seeder.com', members: ['w11-mec1@seeder.com', 'w11-emp1@seeder.com'], city: 'Tigre' },
    { code: 'w12', name: 'Servicio Diesel del Norte', taxId: '30-72010022-2', ownerEmail: 'w12-owner@seeder.com', members: ['w12-mec1@seeder.com', 'w12-emp1@seeder.com'], city: 'Vicente López' },
    { code: 'w13', name: 'Tapizados y Chapa Estilo', taxId: '30-72010023-9', ownerEmail: 'w13-owner@seeder.com', members: ['w13-mec1@seeder.com', 'w13-emp1@seeder.com'], city: 'Avellaneda' },
    { code: 'w14', name: 'Centro de Suspensión y Frenos', taxId: '30-72010024-6', ownerEmail: 'w14-owner@seeder.com', members: ['w14-mec1@seeder.com', 'w14-emp1@seeder.com'], city: 'CABA' },
    { code: 'w15', name: 'Taller El Tanque', taxId: '30-72010025-3', ownerEmail: 'w15-owner@seeder.com', members: ['w15-mec1@seeder.com'], city: 'Escobar' },
    { code: 'w16', name: 'Electricidad Auto Norte', taxId: '30-72010026-0', ownerEmail: 'w16-owner@seeder.com', members: ['w16-mec1@seeder.com'], city: 'Pilar' },
    { code: 'w17', name: 'Taller El Amigo', taxId: '30-72010027-7', ownerEmail: 'w17-owner@seeder.com', members: ['w17-mec1@seeder.com'], city: 'Merlo' },
    { code: 'w18', name: 'A/C Automotriz Frío Total', taxId: '30-72010028-4', ownerEmail: 'w18-owner@seeder.com', members: ['w18-mec1@seeder.com'], city: 'Lomas de Zamora' },
    { code: 'w19', name: 'Mecánica General Integral', taxId: '30-72010029-1', ownerEmail: 'w19-owner@seeder.com', members: ['w19-mec1@seeder.com'], city: 'CABA' },
    { code: 'w20', name: 'Tren Delantero y Suspensión Estrella', taxId: '30-72010030-8', ownerEmail: 'w20-owner@seeder.com', members: ['w20-mec1@seeder.com'], city: 'San Isidro' },
    // Services oficiales: owner = gerente/dueño de la concesionaria nominal.
    { code: 'giorgi-svc', name: 'Giorgi Service Oficial', taxId: '30-72010031-5', ownerEmail: 'giorgi-gerente@seeder.com', members: ['giorgi-svc-mec1@seeder.com', 'giorgi-svc-mec2@seeder.com'], city: 'CABA' },
    { code: 'fortecar-svc', name: 'Fortecar Service Oficial', taxId: '30-72010032-2', ownerEmail: 'fortecar-gerente@seeder.com', members: ['fortecar-svc-mec1@seeder.com', 'fortecar-svc-mec2@seeder.com'], city: 'Avellaneda' },
    { code: 'castro-svc', name: 'Pesado Castro Service Oficial', taxId: '30-72010033-9', ownerEmail: 'castro-gerente@seeder.com', members: ['castro-svc-mec1@seeder.com', 'castro-svc-mec2@seeder.com'], city: 'San Martín' },
  ];

  let created = 0;
  let skipped = 0;

  for (const w of workshopsData) {
    const existingWorkshop = await prisma.workshop.findUnique({
      where: { taxId: w.taxId },
    });
    if (existingWorkshop) {
      skipped++;
      continue;
    }

    const owner = await prisma.user.findUnique({
      where: { email: w.ownerEmail },
    });
    if (!owner) continue;

    const workshop = await prisma.workshop.create({
      data: {
        name: w.name,
        taxId: w.taxId,
        isActive: true,
        // Demo nacen operativas (mismo criterio que seedDealerships): owner
        // directo + memberships activas, no pasan por el wizard de claim →
        // status 'active', claimed_at NULL.
        status: 'active',
      },
    });

    const branch = await prisma.workshopBranch.create({
      data: {
        workshopId: workshop.id,
        name: 'Sede Central',
        isHeadquarters: true,
        city: w.city,
        state: 'Buenos Aires',
        country: 'Argentina',
      },
    });

    const ownerRole = await prisma.workshopRole.create({
      data: {
        workshopId: workshop.id,
        code: 'owner',
        name: 'Dueño',
        description: 'Workshop owner with full access',
        isSystem: true,
        priority: 100,
      },
    });

    const mechanicRole = await prisma.workshopRole.create({
      data: {
        workshopId: workshop.id,
        code: 'mechanic',
        name: 'Mecánico',
        description: 'Workshop mechanic',
        isSystem: true,
        priority: 50,
      },
    });

    const employeeRole = await prisma.workshopRole.create({
      data: {
        workshopId: workshop.id,
        code: 'employee',
        name: 'Empleado',
        description: 'Workshop employee',
        isSystem: true,
        priority: 30,
      },
    });

    // Fechas constantes del dataset (idempotencia: sin new Date()).
    const joinedAt = new Date('2025-01-15T10:00:00.000Z');
    const acceptedAt = new Date('2025-01-15T11:00:00.000Z');

    await prisma.workshopMember.create({
      data: {
        workshopId: workshop.id,
        userId: owner.id,
        roleId: ownerRole.id,
        defaultBranchId: branch.id,
        status: MemberStatus.active,
        joinedAt,
        acceptedAt,
      },
    });

    for (let i = 0; i < w.members.length; i++) {
      const empUser = await prisma.user.findUnique({
        where: { email: w.members[i] },
      });
      if (!empUser) continue;

      const role = i === 0 ? mechanicRole : i === 1 && w.members.length >= 3 ? mechanicRole : employeeRole;
      await prisma.workshopMember.create({
        data: {
          workshopId: workshop.id,
          userId: empUser.id,
          roleId: role.id,
          defaultBranchId: branch.id,
          status: MemberStatus.active,
          joinedAt,
          acceptedAt,
        },
      });
    }
    created++;
  }

  const count = await prisma.workshop.count();
  console.log(`  ✓ ${created} workshops created (${skipped} skipped) — total ${count}`);
}

/**
 * Catálogo de especialidades (12). Natural key: `code` (único).
 * Idempotente: upsert por code.
 */
async function seedSpecialties() {
  const specialtiesData = [
    { code: 'chapa_pintura', name: 'Chapa y Pintura', description: 'Reparación de carrocería y repintado' },
    { code: 'mecanica_general', name: 'Mecánica General', description: 'Mantenimiento y reparación mecánica integral' },
    { code: 'frenos', name: 'Frenos', description: 'Servicio de sistema de frenos' },
    { code: 'tren_delantero', name: 'Tren Delantero', description: 'Suspensión, dirección y alineación delantera' },
    { code: 'suspension', name: 'Suspensión', description: 'Reparación de amortiguadores y suspensiones' },
    { code: 'electricidad', name: 'Electricidad', description: 'Sistema eléctrico del vehículo' },
    { code: 'diagnostico', name: 'Diagnóstico', description: 'Escaneo y diagnóstico computarizado' },
    { code: 'diesel', name: 'Diésel', description: 'Servicio especializado en motores diésel' },
    { code: 'inyeccion', name: 'Inyección', description: 'Sistema de inyección electrónica' },
    { code: 'transmision', name: 'Transmisión', description: 'Caja y transmisión' },
    { code: 'aire_acondicionado', name: 'Aire Acondicionado', description: 'Climatización y aire acondicionado' },
    { code: 'llantas_balanceo', name: 'Llantas y Balanceo', description: 'Alineación, balanceo y rotación de llantas' },
  ];

  let linked = 0;
  for (const s of specialtiesData) {
    await prisma.specialty.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
    linked++;
  }

  const count = await prisma.specialty.count();
  console.log(`  ✓ ${count} specialties seeded`);
}

/**
 * Vincula talleres con sus especialidades (distribución: independientes con
 * 1-4 specialties; services oficiales con 2-3). Idempotente: upsert del par
 * (workshopId, specialtyId). Requiere workshops + specialties ya creados.
 */
async function seedWorkshopSpecialties() {
  // code de taller → códigos de specialty
  const workshopSpecialtiesMap: Record<string, string[]> = {
    w01: ['mecanica_general', 'frenos', 'tren_delantero'],
    w02: ['mecanica_general', 'diagnostico', 'suspension'],
    w03: ['chapa_pintura', 'llantas_balanceo'],
    w04: ['mecanica_general', 'frenos'],
    w05: ['diesel', 'inyeccion'],
    w06: ['electricidad', 'diagnostico'],
    w07: ['transmision', 'mecanica_general'],
    w08: ['frenos', 'tren_delantero', 'suspension', 'llantas_balanceo'],
    w09: ['mecanica_general', 'aire_acondicionado'],
    w10: ['mecanica_general', 'diagnostico', 'electricidad'],
    w11: ['diagnostico', 'inyeccion', 'electricidad'],
    w12: ['diesel', 'inyeccion', 'mecanica_general'],
    w13: ['chapa_pintura'],
    w14: ['frenos', 'suspension', 'tren_delantero'],
    w15: ['diesel'],
    w16: ['electricidad', 'aire_acondicionado'],
    w17: ['mecanica_general', 'frenos'],
    w18: ['aire_acondicionado', 'electricidad'],
    w19: ['mecanica_general', 'frenos', 'tren_delantero', 'suspension'],
    w20: ['tren_delantero', 'suspension', 'llantas_balanceo'],
    'giorgi-svc': ['mecanica_general', 'diagnostico', 'frenos'],
    'fortecar-svc': ['mecanica_general', 'electricidad', 'diagnostico'],
    'castro-svc': ['diagnostico', 'aire_acondicionado', 'diesel'],
  };

  const workshops = await prisma.workshop.findMany();

  let linked = 0;
  const workshopsByTaxId = new Map(workshops.map((w) => [w.taxId, w]));
  for (const [code, specialtyCodes] of Object.entries(workshopSpecialtiesMap)) {
    const taxId = workshopTaxIds[code];
    if (!taxId) continue;
    const workshop = workshopsByTaxId.get(taxId);
    if (!workshop) continue;

    for (const specialtyCode of specialtyCodes) {
      const specialty = await prisma.specialty.findUnique({
        where: { code: specialtyCode },
      });
      if (!specialty) continue;

      await prisma.workshopSpecialty.upsert({
        where: {
          workshopId_specialtyId: {
            workshopId: workshop.id,
            specialtyId: specialty.id,
          },
        },
        update: {},
        create: { workshopId: workshop.id, specialtyId: specialty.id },
      });
      linked++;
    }
  }

  console.log(`  ✓ ${linked} workshop ↔ specialty links seeded`);
}

/**
 * Seeds example dealerships with their system roles (owner / admin / seller)
 * and members — RB-10. Idempotent: skips dealerships that already exist
 * (same pattern as `seedWorkshops`).
 *
 * 5 concesionarias REALES del plan validado:
 *   - FM Automotores (multimarca chico): owner + 1 seller
 *   - Matías Automotores (multimarca chico): owner + 1 seller
 *   - Giorgi (Ford, oficial grande): owner/gerente + admin + 2 sellers
 *   - Fortecar (Chevrolet, oficial grande): owner/gerente + admin + 2 sellers
 *   - Pesado Castro (VW, oficial grande): owner/gerente + admin + 2 sellers
 */
async function seedDealerships() {
  const dealershipsData = [
    {
      name: 'FM Automotores',
      legalName: 'FM Automotores S.A.',
      taxId: '27334270136',
      email: 'contacto@fmautomotores.com.ar',
      phone: '011-4555-0101',
      ownerEmail: 'fm-owner@seeder.com',
      memberEmails: ['fm-seller1@seeder.com'],
      memberRoles: ['seller'],
    },
    {
      name: 'Matías Automotores',
      legalName: 'Matías Automotores S.R.L.',
      taxId: '30-71698425-7',
      email: 'contacto@matiasautomotores.com.ar',
      phone: '011-4555-0202',
      ownerEmail: 'matias-owner@seeder.com',
      memberEmails: ['matias-seller1@seeder.com'],
      memberRoles: ['seller'],
    },
    {
      name: 'Giorgi',
      legalName: 'Giorgi Concesionaria Oficial Ford S.A.',
      taxId: '30-71709321-3',
      email: 'ventas@giorgi.com.ar',
      phone: '011-4555-0303',
      ownerEmail: 'giorgi-gerente@seeder.com',
      memberEmails: ['giorgi-admin@seeder.com', 'giorgi-seller1@seeder.com', 'giorgi-seller2@seeder.com'],
      memberRoles: ['admin', 'seller', 'seller'],
    },
    {
      name: 'Fortecar',
      legalName: 'Fortecar Concesionaria Oficial Chevrolet S.A.',
      taxId: '30-70125584-1',
      email: 'ventas@fortecar.com.ar',
      phone: '011-4555-0404',
      ownerEmail: 'fortecar-gerente@seeder.com',
      memberEmails: ['fortecar-admin@seeder.com', 'fortecar-seller1@seeder.com', 'fortecar-seller2@seeder.com'],
      memberRoles: ['admin', 'seller', 'seller'],
    },
    {
      name: 'Pesado Castro',
      legalName: 'Pesado Castro Concesionaria Oficial VW S.A.',
      taxId: '30-70042389-5',
      email: 'ventas@pesadocastro.com.ar',
      phone: '011-4555-0505',
      ownerEmail: 'castro-gerente@seeder.com',
      memberEmails: ['castro-admin@seeder.com', 'castro-seller1@seeder.com', 'castro-seller2@seeder.com'],
      memberRoles: ['admin', 'seller', 'seller'],
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const d of dealershipsData) {
    const existing = await prisma.dealership.findUnique({
      where: { taxId: d.taxId },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const owner = await prisma.user.findUnique({
      where: { email: d.ownerEmail },
    });
    if (!owner) continue;

    const dealership = await prisma.dealership.create({
      data: {
        name: d.name,
        legalName: d.legalName,
        taxId: d.taxId,
        email: d.email,
        phone: d.phone,
        isActive: true,
        // Demo nacen operativas (D-103 / seed): owner directo + memberships
        // activas, no pasan por el wizard de claim → status 'active', claimed_at NULL.
        status: 'active',
      },
    });

    const ownerRole = await prisma.dealershipRole.create({
      data: {
        dealershipId: dealership.id,
        code: 'owner',
        name: 'Dueño',
        description: 'Dealership owner with full access',
        isSystem: true,
        priority: 100,
      },
    });

    const adminRole = await prisma.dealershipRole.create({
      data: {
        dealershipId: dealership.id,
        code: 'admin',
        name: 'Administrador',
        description: 'Manages dealership operations and members',
        isSystem: true,
        priority: 60,
      },
    });

    const sellerRole = await prisma.dealershipRole.create({
      data: {
        dealershipId: dealership.id,
        code: 'seller',
        name: 'Vendedor',
        description: 'Handles vehicle sales and returns',
        isSystem: true,
        priority: 40,
      },
    });

    // Fechas constantes del dataset (idempotencia: sin new Date()).
    const joinedAt = new Date('2025-02-01T10:00:00.000Z');
    const acceptedAt = new Date('2025-02-01T11:00:00.000Z');

    await prisma.dealershipMember.create({
      data: {
        dealershipId: dealership.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: MemberStatus.active,
        joinedAt,
        acceptedAt,
      },
    });

    for (let i = 0; i < d.memberEmails.length; i++) {
      const memUser = await prisma.user.findUnique({
        where: { email: d.memberEmails[i] },
      });
      if (!memUser) continue;

      const role = d.memberRoles[i] === 'admin' ? adminRole : sellerRole;
      await prisma.dealershipMember.create({
        data: {
          dealershipId: dealership.id,
          userId: memUser.id,
          roleId: role.id,
          status: MemberStatus.active,
          joinedAt,
          acceptedAt,
        },
      });
    }
    created++;
  }

  const count = await prisma.dealership.count();
  console.log(`  ✓ ${created} dealerships created (${skipped} skipped) — total ${count}`);
}

/**
 * Links system workshop roles (owner / mechanic / employee) to their
 * permission codes. Idempotent: upserts the WorkshopRolePermission link.
 *
 * Requires the workshop roles to already exist (run after `seedWorkshops`).
 */
async function seedSystemWorkshopRolePermissions() {
  const roles = await prisma.workshopRole.findMany({
    where: { isSystem: true },
  });

  const permissionCodes = Array.from(
    new Set(Object.values(systemWorkshopRolePermissions).flat()),
  );
  const permissionsByCode = new Map(
    (
      await prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
      })
    ).map((p) => [p.code, p]),
  );

  let linked = 0;
  for (const role of roles) {
    const codes = systemWorkshopRolePermissions[role.code] ?? [];
    for (const code of codes) {
      const permission = permissionsByCode.get(code);
      if (!permission) continue; // permission not defined in seed → skip
      await prisma.workshopRolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
      linked++;
    }
  }

  console.log(`  ✓ ${linked} system workshop role → permission links seeded`);
}

/**
 * Links system dealership roles (owner / admin / seller) to their permission
 * codes — RB-10. Idempotent: upserts the DealershipRolePermission link.
 *
 * Requires the dealership roles to already exist (run after `seedDealerships`).
 */
async function seedSystemDealershipRolePermissions() {
  const roles = await prisma.dealershipRole.findMany({
    where: { isSystem: true },
  });

  const permissionCodes = Array.from(
    new Set(Object.values(systemDealershipRolePermissions).flat()),
  );
  const permissionsByCode = new Map(
    (
      await prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
      })
    ).map((p) => [p.code, p]),
  );

  let linked = 0;
  for (const role of roles) {
    const codes = systemDealershipRolePermissions[role.code] ?? [];
    for (const code of codes) {
      const permission = permissionsByCode.get(code);
      if (!permission) continue; // permission not defined in seed → skip
      await prisma.dealershipRolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
      linked++;
    }
  }

  console.log(`  ✓ ${linked} system dealership role → permission links seeded`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos de negocio del plan validado por PM/database-hcdv
// ─────────────────────────────────────────────────────────────────────────────
// Idempotencia: vehículos → natural key licensePlate (upsert por placa);
// el resto (ownerships/transfers/events/mileages/care episodes) NO tiene
// natural key → ID UUID v4 determinista + upsert(update:{}), mismo patrón
// que seedVehicleCatalog. Fechas SIEMPRE constantes (nunca new Date()).
const det = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const vinFromPlate = (plate: string, seq: number) =>
  `8J8${plate}${String(seq).padStart(7, '0')}`;

// Localiza un miembro de taller (email de usuario) por taxId del taller.
async function findWorkshopMember(workshopTaxId: string, userEmail: string) {
  const workshop = await prisma.workshop.findUnique({
    where: { taxId: workshopTaxId },
  });
  if (!workshop) return null;
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) return null;
  return prisma.workshopMember.findUnique({
    where: { workshopId_userId: { workshopId: workshop.id, userId: user.id } },
  });
}

async function findHeadquarters(workshopId: string) {
  return prisma.workshopBranch.findFirst({
    where: { workshopId, isHeadquarters: true },
  });
}

async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

/**
 * 24 vehículos (20 propietarios: 16×1 + 4×2 = 20). Placas únicas formato AR
 * (AB123CD), VIN 17 chars y engineNumber únicos. Usa versionId del catálogo
 * cuando la versión existe; versionId null para marcas sin versión (D-038).
 * Idempotente: upsert por licensePlate.
 */
async function seedVehicles() {
  const vehiclesData = [
    // Toyota (10)
    { plate: 'AB123CD', versionId: det(1), owner: 'owner01@seeder.com', color: 'Blanco', year: 2021, vin: vinFromPlate('AB123CD', 1), engine: 'ENAB123CDS01' },
    { plate: 'AB234CD', versionId: det(2), owner: 'owner02@seeder.com', color: 'Gris', year: 2022, vin: vinFromPlate('AB234CD', 2), engine: 'ENAB234CDS02' },
    { plate: 'AB345CD', versionId: det(4), owner: 'owner03@seeder.com', color: 'Plata', year: 2020, vin: vinFromPlate('AB345CD', 3), engine: 'ENAB345CDS03' },
    { plate: 'AB456CD', versionId: det(5), owner: 'owner04@seeder.com', color: 'Negro', year: 2023, vin: vinFromPlate('AB456CD', 4), engine: 'ENAB456CDS04' },
    { plate: 'AB567CD', versionId: det(3), owner: 'owner05@seeder.com', color: 'Rojo', year: 2020, vin: vinFromPlate('AB567CD', 5), engine: 'ENAB567CDS05' },
    { plate: 'AB678CD', versionId: det(1), owner: 'owner06@seeder.com', color: 'Azul', year: 2021, vin: vinFromPlate('AB678CD', 6), engine: 'ENAB678CDS06' },
    { plate: 'AB789CD', versionId: det(5), owner: 'owner07@seeder.com', color: 'Blanco', year: 2021, vin: vinFromPlate('AB789CD', 7), engine: 'ENAB789CDS07' },
    { plate: 'AB890CD', versionId: det(17), owner: 'owner08@seeder.com', color: 'Gris', year: 2023, vin: vinFromPlate('AB890CD', 8), engine: 'ENAB890CDS08' },
    { plate: 'AB901CD', versionId: det(3), owner: 'owner09@seeder.com', color: 'Negro', year: 2022, vin: vinFromPlate('AB901CD', 9), engine: 'ENAB901CDS09' },
    { plate: 'AB012CD', versionId: det(2), owner: 'owner10@seeder.com', color: 'Plata', year: 2023, vin: vinFromPlate('AB012CD', 10), engine: 'ENAB012CDS10' },
    // VW (4)
    { plate: 'AC123DE', versionId: det(13), owner: 'owner11@seeder.com', color: 'Rojo', year: 2020, vin: vinFromPlate('AC123DE', 11), engine: 'ENAC123DES11' },
    { plate: 'AC234DE', versionId: det(14), owner: 'owner12@seeder.com', color: 'Azul', year: 2022, vin: vinFromPlate('AC234DE', 12), engine: 'ENAC234DES12' },
    { plate: 'AC345DE', versionId: det(15), owner: 'owner13@seeder.com', color: 'Blanco', year: 2023, vin: vinFromPlate('AC345DE', 13), engine: 'ENAC345DES13' },
    { plate: 'AC456DE', versionId: det(7), owner: 'owner14@seeder.com', color: 'Gris', year: 2021, vin: vinFromPlate('AC456DE', 14), engine: 'ENAC456DES14' },
    // Ford (4)
    { plate: 'AC567DE', versionId: det(8), owner: 'owner15@seeder.com', color: 'Plata', year: 2021, vin: vinFromPlate('AC567DE', 15), engine: 'ENAC567DES15' },
    { plate: 'AC678DE', versionId: det(9), owner: 'owner16@seeder.com', color: 'Negro', year: 2022, vin: vinFromPlate('AC678DE', 16), engine: 'ENAC678DES16' },
    { plate: 'AC789DE', versionId: det(16), owner: 'owner17@seeder.com', color: 'Gris', year: 2023, vin: vinFromPlate('AC789DE', 17), engine: 'ENAC789DES17' },
    { plate: 'AD234EF', versionId: det(16), owner: 'owner03@seeder.com', color: 'Azul', year: 2022, vin: vinFromPlate('AD234EF', 18), engine: 'ENAD234EFS18' },
    // Chevrolet (4)
    { plate: 'AC890DE', versionId: det(10), owner: 'owner18@seeder.com', color: 'Blanco', year: 2023, vin: vinFromPlate('AC890DE', 19), engine: 'ENAC890DES19' },
    { plate: 'AC901DE', versionId: det(11), owner: 'owner19@seeder.com', color: 'Negro', year: 2024, vin: vinFromPlate('AC901DE', 20), engine: 'ENAC901DES20' },
    { plate: 'AC012DE', versionId: det(12), owner: 'owner20@seeder.com', color: 'Rojo', year: 2023, vin: vinFromPlate('AC012DE', 21), engine: 'ENAC012DES21' },
    { plate: 'AD456EF', versionId: det(12), owner: 'owner07@seeder.com', color: 'Plata', year: 2022, vin: vinFromPlate('AD456EF', 22), engine: 'ENAD456EFS22' },
    // Fiat / Peugeot (2)
    { plate: 'AD123EF', versionId: det(18), owner: 'owner01@seeder.com', color: 'Gris', year: 2021, vin: vinFromPlate('AD123EF', 23), engine: 'ENAD123EFS23' },
    { plate: 'AD345EF', versionId: null, owner: 'owner05@seeder.com', color: 'Blanco', year: 2019, vin: vinFromPlate('AD345EF', 24), engine: 'ENAD345EFS24' },
  ];

  let created = 0;
  let skipped = 0;

  for (const v of vehiclesData) {
    const existing = await prisma.vehicle.findUnique({
      where: { licensePlate: v.plate },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.vehicle.create({
      data: {
        licensePlate: v.plate,
        versionId: v.versionId,
        vin: v.vin,
        engineNumber: v.engine,
        manufactureYear: v.year,
        modelYear: v.year,
        color: v.color,
      },
    });
    created++;
  }

  const count = await prisma.vehicle.count();
  console.log(`  ✓ ${created} vehicles created (${skipped} skipped) — total ${count}`);
}

/**
 * 8 transferencias del plan validado:
 *   T1-T3: user → user completed
 *   T4: user → dealership Fortecar completed (consignación)
 *   T5: dealership Fortecar → user completed (venta)
 *   T6: user → user pending (expiresAt futuro)
 *   T7: user → user rejected
 *   T8: user → user expired
 * Respeta CHECKs XOR (from/to user XOR dealership) y not_self.
 * Tendero: id determinista + upsert(update:{}).
 */
async function seedTransfers() {
  const transfersData = [
    // T1 completed: AC678DE (Ranger) user12 → owner16
    { id: det(300), plate: 'AC678DE', fromUser: 'user12@seeder.com', toUser: 'owner16@seeder.com', status: 'completed', requestedAt: new Date('2023-02-01T12:00:00.000Z'), respondedAt: new Date('2023-02-10T15:00:00.000Z'), completedAt: new Date('2023-02-10T15:30:00.000Z'), note: 'Venta entre particulares' },
    // T2 completed: AC234DE (Polo) user11 → owner12
    { id: det(301), plate: 'AC234DE', fromUser: 'user11@seeder.com', toUser: 'owner12@seeder.com', status: 'completed', requestedAt: new Date('2022-10-10T10:00:00.000Z'), respondedAt: new Date('2022-10-17T09:00:00.000Z'), completedAt: new Date('2022-10-17T09:30:00.000Z'), note: 'Venta entre particulares' },
    // T3 completed: AC345DE (Taos) user09 → owner13
    { id: det(302), plate: 'AC345DE', fromUser: 'user9@seeder.com', toUser: 'owner13@seeder.com', status: 'completed', requestedAt: new Date('2023-05-01T11:00:00.000Z'), respondedAt: new Date('2023-05-03T16:00:00.000Z'), completedAt: new Date('2023-05-03T16:30:00.000Z'), note: 'Venta entre particulares' },
    // T4 completed (consignación): AC901DE (S10) owner19 → Fortecar
    { id: det(303), plate: 'AC901DE', fromUser: 'owner19@seeder.com', toDealership: '30-70125584-1', status: 'completed', requestedAt: new Date('2024-03-01T10:00:00.000Z'), respondedAt: new Date('2024-03-20T10:00:00.000Z'), completedAt: new Date('2024-03-20T10:30:00.000Z'), note: 'Consignación en Fortecar' },
    // T5 completed (venta): AC901DE Fortecar → owner20
    { id: det(304), plate: 'AC901DE', fromDealership: '30-70125584-1', toUser: 'owner20@seeder.com', status: 'completed', requestedAt: new Date('2024-05-01T10:00:00.000Z'), respondedAt: new Date('2024-05-10T14:00:00.000Z'), completedAt: new Date('2024-05-10T14:30:00.000Z'), note: 'Venta desde consignación' },
    // T6 pending: AC234DE owner12 → user25 (expira en el futuro)
    { id: det(305), plate: 'AC234DE', fromUser: 'owner12@seeder.com', toUser: 'user25@seeder.com', status: 'pending', requestedAt: new Date('2026-09-01T10:00:00.000Z'), expiresAt: new Date('2026-12-31T23:59:59.000Z'), note: 'Transferencia en curso' },
    // T7 rejected: AC567DE (Ranger) owner15 → owner16
    { id: det(306), plate: 'AC567DE', fromUser: 'owner15@seeder.com', toUser: 'owner16@seeder.com', status: 'rejected', requestedAt: new Date('2026-07-01T10:00:00.000Z'), respondedAt: new Date('2026-07-05T10:00:00.000Z'), note: 'Rechazada por el receptor' },
    // T8 expired: AC123DE (Gol) owner11 → owner12
    { id: det(307), plate: 'AC123DE', fromUser: 'owner11@seeder.com', toUser: 'owner12@seeder.com', status: 'expired', requestedAt: new Date('2026-03-01T10:00:00.000Z'), expiresAt: new Date('2026-04-01T23:59:59.000Z'), note: 'Vencida sin respuesta' },
  ];

  let created = 0;
  for (const t of transfersData) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { licensePlate: t.plate },
    });
    if (!vehicle) continue;

    const fromUser = t.fromUser ? await findUserByEmail(t.fromUser) : null;
    const toUser = t.toUser ? await findUserByEmail(t.toUser) : null;
    const fromDealership = t.fromDealership
      ? await prisma.dealership.findUnique({ where: { taxId: t.fromDealership } })
      : null;
    const toDealership = t.toDealership
      ? await prisma.dealership.findUnique({ where: { taxId: t.toDealership } })
      : null;

    await prisma.vehicleTransfer.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        vehicleId: vehicle.id,
        fromUserId: fromUser?.id ?? null,
        toUserId: toUser?.id ?? null,
        fromDealershipId: fromDealership?.id ?? null,
        toDealershipId: toDealership?.id ?? null,
        status: t.status as TransferStatus,
        requestedAt: t.requestedAt,
        respondedAt: t.respondedAt ?? null,
        completedAt: t.completedAt ?? null,
        expiresAt: t.expiresAt ?? null,
        notes: t.note,
        createdAt: t.requestedAt,
      },
    });
    created++;
  }

  const count = await prisma.vehicleTransfer.count();
  console.log(`  ✓ ${created} transfers upserted — total ${count}`);
}

/**
 * ~25 eventos de transferencia (requested → ownership_closed →
 * ownership_created → completed en completadas; requested en pending;
 * requested + rejected en rechazadas; requested + expired en vencidas).
 * Coherentes con el código real (no existe evento `accepted`).
 * performedByUserId: emisor/receptor; lado concesionaria → miembro actuante.
 */
async function seedTransferEvents() {
  const eventsData = [
    // T1 (AC678DE user12 → owner16)
    { id: det(400), transferId: det(300), type: 'requested', by: 'user12@seeder.com', at: new Date('2023-02-01T12:00:00.000Z') },
    { id: det(401), transferId: det(300), type: 'ownership_closed', by: 'owner16@seeder.com', at: new Date('2023-02-10T15:00:00.000Z') },
    { id: det(402), transferId: det(300), type: 'ownership_created', by: 'owner16@seeder.com', at: new Date('2023-02-10T15:00:05.000Z') },
    { id: det(403), transferId: det(300), type: 'completed', by: 'owner16@seeder.com', at: new Date('2023-02-10T15:30:00.000Z') },
    // T2 (AC234DE user11 → owner12)
    { id: det(404), transferId: det(301), type: 'requested', by: 'user11@seeder.com', at: new Date('2022-10-10T10:00:00.000Z') },
    { id: det(405), transferId: det(301), type: 'ownership_closed', by: 'owner12@seeder.com', at: new Date('2022-10-17T09:00:00.000Z') },
    { id: det(406), transferId: det(301), type: 'ownership_created', by: 'owner12@seeder.com', at: new Date('2022-10-17T09:00:05.000Z') },
    { id: det(407), transferId: det(301), type: 'completed', by: 'owner12@seeder.com', at: new Date('2022-10-17T09:30:00.000Z') },
    // T3 (AC345DE user09 → owner13)
    { id: det(408), transferId: det(302), type: 'requested', by: 'user9@seeder.com', at: new Date('2023-05-01T11:00:00.000Z') },
    { id: det(409), transferId: det(302), type: 'ownership_closed', by: 'owner13@seeder.com', at: new Date('2023-05-03T16:00:00.000Z') },
    { id: det(410), transferId: det(302), type: 'ownership_created', by: 'owner13@seeder.com', at: new Date('2023-05-03T16:00:05.000Z') },
    { id: det(411), transferId: det(302), type: 'completed', by: 'owner13@seeder.com', at: new Date('2023-05-03T16:30:00.000Z') },
    // T4 (AC901DE owner19 → Fortecar) — miembro actuante: fortecari-seller1
    { id: det(412), transferId: det(303), type: 'requested', by: 'owner19@seeder.com', at: new Date('2024-03-01T10:00:00.000Z') },
    { id: det(413), transferId: det(303), type: 'ownership_closed', by: 'fortecar-seller1@seeder.com', at: new Date('2024-03-20T10:00:00.000Z') },
    { id: det(414), transferId: det(303), type: 'ownership_created', by: 'fortecar-seller1@seeder.com', at: new Date('2024-03-20T10:00:05.000Z') },
    { id: det(415), transferId: det(303), type: 'completed', by: 'fortecar-seller1@seeder.com', at: new Date('2024-03-20T10:30:00.000Z') },
    // T5 (AC901DE Fortecar → owner20)
    { id: det(416), transferId: det(304), type: 'requested', by: 'fortecar-seller1@seeder.com', at: new Date('2024-05-01T10:00:00.000Z') },
    { id: det(417), transferId: det(304), type: 'ownership_closed', by: 'owner20@seeder.com', at: new Date('2024-05-10T14:00:00.000Z') },
    { id: det(418), transferId: det(304), type: 'ownership_created', by: 'owner20@seeder.com', at: new Date('2024-05-10T14:00:05.000Z') },
    { id: det(419), transferId: det(304), type: 'completed', by: 'owner20@seeder.com', at: new Date('2024-05-10T14:30:00.000Z') },
    // T6 pending (AC234DE owner12 → user25)
    { id: det(420), transferId: det(305), type: 'requested', by: 'owner12@seeder.com', at: new Date('2026-09-01T10:00:00.000Z') },
    // T7 rejected (AC567DE owner15 → owner16)
    { id: det(421), transferId: det(306), type: 'requested', by: 'owner15@seeder.com', at: new Date('2026-07-01T10:00:00.000Z') },
    { id: det(422), transferId: det(306), type: 'rejected', by: 'owner16@seeder.com', at: new Date('2026-07-05T10:00:00.000Z') },
    // T8 expired (AC123DE owner11 → owner12)
    { id: det(423), transferId: det(307), type: 'requested', by: 'owner11@seeder.com', at: new Date('2026-03-01T10:00:00.000Z') },
    { id: det(424), transferId: det(307), type: 'expired', by: null, at: new Date('2026-04-02T00:00:00.000Z') },
  ];

  let created = 0;
  for (const e of eventsData) {
    const transfer = await prisma.vehicleTransfer.findUnique({
      where: { id: e.transferId },
    });
    if (!transfer) continue;

    const by = e.by ? await findUserByEmail(e.by) : null;

    await prisma.vehicleTransferEvent.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        transferId: transfer.id,
        type: e.type as VehicleTransferEventType,
        performedByUserId: by?.id ?? null,
        createdAt: e.at,
      },
    });
    created++;
  }

  const count = await prisma.vehicleTransferEvent.count();
  console.log(`  ✓ ${created} transfer events upserted — total ${count}`);
}

/**
 * ~36 ownerships: 24 activas (1 por vehículo, endsAt null = INVARIANTE) +
 * ~12 históricas con cadena continua (endsAt anterior == startsAt siguiente).
 * Incluye titularidad intermedia concesionaria Fortecar (type company).
 * Idempotente: id determinista + upsert(update:{}).
 */
async function seedOwnerships() {
  const ownershipsData = [
    // Vehículos sin transfer → 1 ownership activa (startsAt registro).
    { id: det(200), plate: 'AB123CD', user: 'owner01@seeder.com', type: 'owner', startsAt: new Date('2023-06-01T10:00:00.000Z'), endsAt: null },
    { id: det(201), plate: 'AB234CD', user: 'owner02@seeder.com', type: 'owner', startsAt: new Date('2024-01-15T10:00:00.000Z'), endsAt: null },
    { id: det(202), plate: 'AB345CD', user: 'owner03@seeder.com', type: 'owner', startsAt: new Date('2022-08-10T10:00:00.000Z'), endsAt: null },
    { id: det(203), plate: 'AB456CD', user: 'owner04@seeder.com', type: 'owner', startsAt: new Date('2023-03-20T10:00:00.000Z'), endsAt: null },
    { id: det(204), plate: 'AB567CD', user: 'owner05@seeder.com', type: 'owner', startsAt: new Date('2021-11-05T10:00:00.000Z'), endsAt: null },
    { id: det(205), plate: 'AB678CD', user: 'owner06@seeder.com', type: 'owner', startsAt: new Date('2024-05-30T10:00:00.000Z'), endsAt: null },
    { id: det(206), plate: 'AB789CD', user: 'owner07@seeder.com', type: 'owner', startsAt: new Date('2022-02-14T10:00:00.000Z'), endsAt: null },
    { id: det(207), plate: 'AB890CD', user: 'owner08@seeder.com', type: 'owner', startsAt: new Date('2023-09-12T10:00:00.000Z'), endsAt: null },
    { id: det(208), plate: 'AB901CD', user: 'owner09@seeder.com', type: 'owner', startsAt: new Date('2022-04-22T10:00:00.000Z'), endsAt: null },
    { id: det(209), plate: 'AB012CD', user: 'owner10@seeder.com', type: 'owner', startsAt: new Date('2023-12-08T10:00:00.000Z'), endsAt: null },
    { id: det(210), plate: 'AC123DE', user: 'owner11@seeder.com', type: 'owner', startsAt: new Date('2020-07-01T10:00:00.000Z'), endsAt: null },
    { id: det(211), plate: 'AC456DE', user: 'owner14@seeder.com', type: 'owner', startsAt: new Date('2021-06-25T10:00:00.000Z'), endsAt: null },
    { id: det(212), plate: 'AC567DE', user: 'owner15@seeder.com', type: 'owner', startsAt: new Date('2022-01-19T10:00:00.000Z'), endsAt: null },
    { id: det(213), plate: 'AC789DE', user: 'owner17@seeder.com', type: 'owner', startsAt: new Date('2023-06-15T10:00:00.000Z'), endsAt: null },
    { id: det(214), plate: 'AD234EF', user: 'owner03@seeder.com', type: 'owner', startsAt: new Date('2022-11-01T10:00:00.000Z'), endsAt: null },
    { id: det(215), plate: 'AC890DE', user: 'owner18@seeder.com', type: 'owner', startsAt: new Date('2023-12-20T10:00:00.000Z'), endsAt: null },
    { id: det(216), plate: 'AC012DE', user: 'owner20@seeder.com', type: 'owner', startsAt: new Date('2023-10-30T10:00:00.000Z'), endsAt: null },
    { id: det(217), plate: 'AD456EF', user: 'owner07@seeder.com', type: 'owner', startsAt: new Date('2022-05-25T10:00:00.000Z'), endsAt: null },
    { id: det(218), plate: 'AD123EF', user: 'owner01@seeder.com', type: 'owner', startsAt: new Date('2023-01-10T10:00:00.000Z'), endsAt: null },
    { id: det(219), plate: 'AD345EF', user: 'owner05@seeder.com', type: 'owner', startsAt: new Date('2020-03-15T10:00:00.000Z'), endsAt: null },
    // T1: AC678DE user12 (histórica) → owner16 (activa, transfer 300)
    { id: det(220), plate: 'AC678DE', user: 'user12@seeder.com', type: 'owner', startsAt: new Date('2021-03-01T10:00:00.000Z'), endsAt: new Date('2023-02-10T15:00:00.000Z') },
    { id: det(221), plate: 'AC678DE', user: 'owner16@seeder.com', type: 'owner', startsAt: new Date('2023-02-10T15:30:00.000Z'), endsAt: null, transfer: det(300) },
    // T2: AC234DE user11 (histórica) → owner12 (activa, transfer 301)
    { id: det(222), plate: 'AC234DE', user: 'user11@seeder.com', type: 'owner', startsAt: new Date('2022-02-01T10:00:00.000Z'), endsAt: new Date('2022-10-17T09:00:00.000Z') },
    { id: det(223), plate: 'AC234DE', user: 'owner12@seeder.com', type: 'owner', startsAt: new Date('2022-10-17T09:30:00.000Z'), endsAt: null, transfer: det(301) },
    // T3: AC345DE user09 (histórica) → owner13 (activa, transfer 302)
    { id: det(224), plate: 'AC345DE', user: 'user9@seeder.com', type: 'owner', startsAt: new Date('2022-08-01T10:00:00.000Z'), endsAt: new Date('2023-05-03T16:00:00.000Z') },
    { id: det(225), plate: 'AC345DE', user: 'owner13@seeder.com', type: 'owner', startsAt: new Date('2023-05-03T16:30:00.000Z'), endsAt: null, transfer: det(302) },
    // T4: AC901DE owner19 (histórica) → Fortecar company (histórica, transfer 303)
    { id: det(226), plate: 'AC901DE', user: 'owner19@seeder.com', type: 'owner', startsAt: new Date('2024-01-15T10:00:00.000Z'), endsAt: new Date('2024-03-20T10:00:00.000Z') },
    { id: det(227), plate: 'AC901DE', dealership: '30-70125584-1', type: 'company', startsAt: new Date('2024-03-20T10:30:00.000Z'), endsAt: new Date('2024-05-10T14:00:00.000Z'), transfer: det(303) },
    // T5: AC901DE Fortecar (cerrada arriba) → owner20 (activa, transfer 304)
    { id: det(228), plate: 'AC901DE', user: 'owner20@seeder.com', type: 'owner', startsAt: new Date('2024-05-10T14:30:00.000Z'), endsAt: null, transfer: det(304) },
    // Históricas previas adicionales (adquisición de vehículo usado)
    { id: det(229), plate: 'AB123CD', user: 'user20@seeder.com', type: 'owner', startsAt: new Date('2022-01-10T10:00:00.000Z'), endsAt: new Date('2023-06-01T10:00:00.000Z') },
    { id: det(230), plate: 'AB234CD', user: 'user19@seeder.com', type: 'owner', startsAt: new Date('2023-02-05T10:00:00.000Z'), endsAt: new Date('2024-01-15T10:00:00.000Z') },
    { id: det(231), plate: 'AB345CD', user: 'user18@seeder.com', type: 'owner', startsAt: new Date('2021-05-12T10:00:00.000Z'), endsAt: new Date('2022-08-10T10:00:00.000Z') },
    { id: det(232), plate: 'AB456CD', user: 'user17@seeder.com', type: 'owner', startsAt: new Date('2022-01-03T10:00:00.000Z'), endsAt: new Date('2023-03-20T10:00:00.000Z') },
    { id: det(233), plate: 'AB567CD', user: 'user16@seeder.com', type: 'owner', startsAt: new Date('2020-12-01T10:00:00.000Z'), endsAt: new Date('2021-11-05T10:00:00.000Z') },
    { id: det(234), plate: 'AB678CD', user: 'user15@seeder.com', type: 'owner', startsAt: new Date('2023-06-20T10:00:00.000Z'), endsAt: new Date('2024-05-30T10:00:00.000Z') },
    { id: det(235), plate: 'AB789CD', user: 'user14@seeder.com', type: 'owner', startsAt: new Date('2021-02-14T10:00:00.000Z'), endsAt: new Date('2022-02-14T10:00:00.000Z') },
  ];

  let created = 0;
  for (const o of ownershipsData) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { licensePlate: o.plate },
    });
    if (!vehicle) continue;

    const user = o.user ? await findUserByEmail(o.user) : null;
    const dealership = o.dealership
      ? await prisma.dealership.findUnique({ where: { taxId: o.dealership } })
      : null;
    const transfer = o.transfer
      ? await prisma.vehicleTransfer.findUnique({ where: { id: o.transfer } })
      : null;

    await prisma.vehicleOwnership.upsert({
      where: { id: o.id },
      update: {},
      create: {
        id: o.id,
        vehicleId: vehicle.id,
        userId: user?.id ?? null,
        dealershipId: dealership?.id ?? null,
        type: o.type as OwnershipType,
        startsAt: o.startsAt,
        endsAt: o.endsAt ?? null,
        acquiredByTransferId: transfer?.id ?? null,
        createdAt: o.startsAt,
      },
    });
    created++;
  }

  const actives = await prisma.vehicleOwnership.count({ where: { endsAt: null } });
  const count = await prisma.vehicleOwnership.count();
  console.log(`  ✓ ${created} ownerships upserted — total ${count} (${actives} activas)`);
}

/**
 * ~48 kilometrajes (1-3 por vehículo, 2 en prom.) — fechas deterministas,
 * valores crecientes y coherentes con mileageIn de los care episodes.
 * source mezclado: owner / workshop / inspection / dealership / system.
 */
async function seedMileages() {
  // [placa, [ [mileage, source, recordedBy(email|null), recordedAt], ... ]]
  const mileagesData: Array<[
    string,
    Array<[number, string, string | null, string]>,
  ]> = [
    ['AB123CD', [[12500, 'owner', 'owner01@seeder.com', '2024-01-10T10:00:00.000Z'], [16800, 'workshop', 'w01-mec1@seeder.com', '2025-03-14T10:00:00.000Z']]],
    ['AB234CD', [[8200, 'owner', 'owner02@seeder.com', '2024-06-01T10:00:00.000Z'], [12400, 'workshop', 'w02-mec1@seeder.com', '2026-02-10T10:00:00.000Z']]],
    ['AB345CD', [[45300, 'owner', 'owner03@seeder.com', '2023-09-01T10:00:00.000Z'], [50200, 'inspection', null, '2024-11-20T10:00:00.000Z'], [54800, 'workshop', 'w04-mec1@seeder.com', '2026-05-05T10:00:00.000Z']]],
    ['AB456CD', [[9800, 'owner', 'owner04@seeder.com', '2024-02-15T10:00:00.000Z'], [14200, 'dealership', 'fortecar-seller1@seeder.com', '2025-08-12T10:00:00.000Z']]],
    ['AB567CD', [[51200, 'owner', 'owner05@seeder.com', '2022-09-01T10:00:00.000Z'], [58900, 'workshop', 'w03-mec1@seeder.com', '2024-04-18T10:00:00.000Z']]],
    ['AB678CD', [[5400, 'owner', 'owner06@seeder.com', '2024-12-01T10:00:00.000Z'], [8200, 'workshop', 'w05-mec1@seeder.com', '2026-03-22T10:00:00.000Z']]],
    ['AB789CD', [[22800, 'owner', 'owner07@seeder.com', '2023-05-01T10:00:00.000Z'], [26400, 'workshop', 'w06-mec1@seeder.com', '2024-09-02T10:00:00.000Z']]],
    ['AB890CD', [[6100, 'owner', 'owner08@seeder.com', '2024-01-20T10:00:00.000Z'], [9800, 'system', null, '2025-11-15T10:00:00.000Z']]],
    ['AB901CD', [[15600, 'owner', 'owner09@seeder.com', '2023-07-01T10:00:00.000Z'], [20300, 'workshop', 'w09-mec1@seeder.com', '2025-06-30T10:00:00.000Z']]],
    ['AB012CD', [[7300, 'owner', 'owner10@seeder.com', '2024-03-11T10:00:00.000Z'], [11000, 'inspection', null, '2026-01-08T10:00:00.000Z']]],
    ['AC123DE', [[66500, 'owner', 'owner11@seeder.com', '2023-02-01T10:00:00.000Z'], [72400, 'workshop', 'w07-mec1@seeder.com', '2025-09-16T10:00:00.000Z']]],
    ['AC234DE', [[14800, 'owner', 'owner12@seeder.com', '2023-08-01T10:00:00.000Z'], [17200, 'workshop', 'w08-mec1@seeder.com', '2024-07-07T10:00:00.000Z']]],
    ['AC345DE', [[8900, 'owner', 'owner13@seeder.com', '2024-02-05T10:00:00.000Z'], [13100, 'workshop', 'w10-mec1@seeder.com', '2026-04-11T10:00:00.000Z']]],
    ['AC456DE', [[34200, 'owner', 'owner14@seeder.com', '2023-10-01T10:00:00.000Z'], [39500, 'dealership', 'matias-seller1@seeder.com', '2025-12-03T10:00:00.000Z']]],
    ['AC567DE', [[29500, 'owner', 'owner15@seeder.com', '2023-04-01T10:00:00.000Z'], [33100, 'workshop', 'w11-mec1@seeder.com', '2024-08-24T10:00:00.000Z']]],
    ['AC678DE', [[10400, 'owner', 'owner16@seeder.com', '2023-03-01T10:00:00.000Z'], [14700, 'workshop', 'w12-mec1@seeder.com', '2025-10-19T10:00:00.000Z']]],
    ['AC789DE', [[5600, 'owner', 'owner17@seeder.com', '2024-01-02T10:00:00.000Z'], [9100, 'workshop', 'w14-mec1@seeder.com', '2026-02-21T10:00:00.000Z']]],
    ['AD234EF', [[11800, 'owner', 'owner03@seeder.com', '2023-09-10T10:00:00.000Z'], [15600, 'workshop', 'w02-mec1@seeder.com', '2025-08-02T10:00:00.000Z']]],
    ['AC890DE', [[7200, 'owner', 'owner18@seeder.com', '2024-04-14T10:00:00.000Z'], [12300, 'workshop', 'w13-mec1@seeder.com', '2026-01-27T10:00:00.000Z']]],
    ['AC901DE', [[2100, 'owner', 'owner19@seeder.com', '2024-02-01T10:00:00.000Z'], [3800, 'dealership', 'fortecar-seller1@seeder.com', '2024-04-20T10:00:00.000Z'], [6500, 'owner', 'owner20@seeder.com', '2025-07-01T10:00:00.000Z']]],
    ['AC012DE', [[11500, 'owner', 'owner20@seeder.com', '2024-03-01T10:00:00.000Z'], [16400, 'workshop', 'w16-mec1@seeder.com', '2025-11-10T10:00:00.000Z']]],
    ['AD456EF', [[19700, 'owner', 'owner07@seeder.com', '2023-11-01T10:00:00.000Z'], [23500, 'workshop', 'w17-mec1@seeder.com', '2025-04-05T10:00:00.000Z']]],
    ['AD123EF', [[28700, 'owner', 'owner01@seeder.com', '2024-01-25T10:00:00.000Z'], [31900, 'workshop', 'w18-mec1@seeder.com', '2025-09-28T10:00:00.000Z']]],
    ['AD345EF', [[76300, 'owner', 'owner05@seeder.com', '2022-12-01T10:00:00.000Z'], [81900, 'system', null, '2026-06-15T10:00:00.000Z']]],
  ];

  let created = 0;
  for (const [plate, records] of mileagesData) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { licensePlate: plate },
    });
    if (!vehicle) continue;

    for (let i = 0; i < records.length; i++) {
      const [mileage, source, byEmail, recordedAt] = records[i];
      const id = det(500 + created);

      const recordedByUser = source === 'owner' || source === 'dealership'
        ? await findUserByEmail(byEmail as string)
        : null;
      const recordedByMember =
        source === 'workshop'
          ? await (async () => {
              // El miembro del taller que registra el kilometraje se resuelve
              // por email; los workshops wXX se identifican por prefijo del email.
              const email = byEmail as string;
              const code = email.split('-')[0];
              const taxId = workshopTaxIds[code];
              return taxId ? findWorkshopMember(taxId, email) : null;
            })()
          : null;

      await prisma.vehicleMileage.upsert({
        where: { id },
        update: {},
        create: {
          id,
          vehicleId: vehicle.id,
          mileage,
          source: source as MileageSource,
          recordedByUserId: recordedByUser?.id ?? null,
          recordedByMemberId: recordedByMember?.id ?? null,
          recordedAt: new Date(recordedAt),
          createdAt: new Date(recordedAt),
        },
      });
      created++;
    }
  }

  const count = await prisma.vehicleMileage.count();
  console.log(`  ✓ ${created} mileages upserted — total ${count}`);
}

/**
 * 30 care episodes del plan validado:
 *   workshop delivered verified 12 | workshop delivered unverified 4
 *   workshop open 1 | workshop cancelled 1
 *   owner delivered verified 7 | owner delivered unverified 5
 * createdByMemberId presente en todos los workshop-source; fechas pasadas
 * deterministas; verifiedByMemberId/verifiedAt para verified (miembro del
 * mismo taller en workshop-source; miembro verificador en owner-source).
 */
async function seedCareEpisodes() {
  // [placa, tallerTaxId (null = owner-source), workerEmail, status, source,
  //  verification, serviceDate, mileageIn, createdAt, verifiedEmail|null]
  const episodesData: Array<[
    string, string | null, string | null, string, string, string,
    string, number, string, string | null,
  ]> = [
    // Workshop delivered + verified (12)
    ['AB123CD', workshopTaxIds.w01, 'w01-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2025-03-14T09:00:00.000Z', 16800, '2025-03-13T15:00:00.000Z', 'w01-mec1@seeder.com'],
    ['AB234CD', workshopTaxIds.w02, 'w02-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2026-02-10T09:00:00.000Z', 12400, '2026-02-09T16:00:00.000Z', 'w02-mec1@seeder.com'],
    ['AB345CD', workshopTaxIds.w04, 'w04-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2026-05-05T09:00:00.000Z', 54800, '2026-05-04T17:00:00.000Z', 'w04-mec1@seeder.com'],
    ['AB567CD', workshopTaxIds.w03, 'w03-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2024-04-18T09:00:00.000Z', 58900, '2024-04-17T15:00:00.000Z', 'w03-mec1@seeder.com'],
    ['AB567CD', workshopTaxIds.w03, 'w03-mec2@seeder.com', 'delivered', 'workshop', 'verified', '2023-02-12T09:00:00.000Z', 52400, '2023-02-11T14:00:00.000Z', 'w03-mec2@seeder.com'],
    ['AB678CD', workshopTaxIds.w05, 'w05-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2026-03-22T09:00:00.000Z', 8200, '2026-03-21T16:00:00.000Z', 'w05-mec1@seeder.com'],
    ['AB789CD', workshopTaxIds.w06, 'w06-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2024-09-02T09:00:00.000Z', 26400, '2024-09-01T15:30:00.000Z', 'w06-mec1@seeder.com'],
    ['AB901CD', workshopTaxIds.w09, 'w09-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2025-06-30T09:00:00.000Z', 20300, '2025-06-29T17:00:00.000Z', 'w09-mec1@seeder.com'],
    ['AC123DE', workshopTaxIds.w07, 'w07-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2025-09-16T09:00:00.000Z', 72400, '2025-09-15T15:00:00.000Z', 'w07-mec1@seeder.com'],
    ['AC234DE', workshopTaxIds.w08, 'w08-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2024-07-07T09:00:00.000Z', 17200, '2024-07-06T16:00:00.000Z', 'w08-mec1@seeder.com'],
    ['AC345DE', workshopTaxIds.w10, 'w10-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2026-04-11T09:00:00.000Z', 13100, '2026-04-10T15:00:00.000Z', 'w10-mec1@seeder.com'],
    ['AC567DE', workshopTaxIds.w11, 'w11-mec1@seeder.com', 'delivered', 'workshop', 'verified', '2024-08-24T09:00:00.000Z', 33100, '2024-08-23T14:00:00.000Z', 'w11-mec1@seeder.com'],
    // Workshop delivered + unverified (4)
    ['AC678DE', workshopTaxIds.w12, 'w12-mec1@seeder.com', 'delivered', 'workshop', 'unverified', '2025-10-19T09:00:00.000Z', 14700, '2025-10-18T15:00:00.000Z', null],
    ['AC789DE', workshopTaxIds.w14, 'w14-mec1@seeder.com', 'delivered', 'workshop', 'unverified', '2026-02-21T09:00:00.000Z', 9100, '2026-02-20T16:00:00.000Z', null],
    ['AD234EF', workshopTaxIds.w02, 'w02-mec1@seeder.com', 'delivered', 'workshop', 'unverified', '2025-08-02T09:00:00.000Z', 15600, '2025-08-01T15:00:00.000Z', null],
    ['AC890DE', workshopTaxIds.w13, 'w13-mec1@seeder.com', 'delivered', 'workshop', 'unverified', '2026-01-27T09:00:00.000Z', 12300, '2026-01-26T14:00:00.000Z', null],
    // Workshop open (1)
    ['AC012DE', workshopTaxIds.w16, 'w16-mec1@seeder.com', 'open', 'workshop', 'unverified', '2026-09-15T09:00:00.000Z', 16400, '2026-09-15T08:30:00.000Z', null],
    // Workshop cancelled (1)
    ['AD456EF', workshopTaxIds.w17, 'w17-mec1@seeder.com', 'cancelled', 'workshop', 'unverified', '2025-04-05T09:00:00.000Z', 23500, '2025-04-04T15:00:00.000Z', null],
    // Owner delivered + verified (7)
    ['AB456CD', null, null, 'delivered', 'owner', 'verified', '2025-08-12T09:00:00.000Z', 14200, '2025-08-12T08:00:00.000Z', 'fortecar-svc-mec1@seeder.com'],
    ['AB890CD', null, null, 'delivered', 'owner', 'verified', '2025-11-15T09:00:00.000Z', 9800, '2025-11-15T08:00:00.000Z', 'castro-svc-mec1@seeder.com'],
    ['AB012CD', null, null, 'delivered', 'owner', 'verified', '2026-01-08T09:00:00.000Z', 11000, '2026-01-08T08:00:00.000Z', 'giorgi-svc-mec1@seeder.com'],
    ['AC456DE', null, null, 'delivered', 'owner', 'verified', '2025-12-03T09:00:00.000Z', 39500, '2025-12-03T08:00:00.000Z', 'matias-seller1@seeder.com'],
    ['AD123EF', null, null, 'delivered', 'owner', 'verified', '2025-09-28T09:00:00.000Z', 31900, '2025-09-28T08:00:00.000Z', 'w18-mec1@seeder.com'],
    ['AB345CD', null, null, 'delivered', 'owner', 'verified', '2024-11-20T09:00:00.000Z', 50200, '2024-11-20T08:00:00.000Z', 'w04-mec1@seeder.com'],
    ['AB901CD', null, null, 'delivered', 'owner', 'verified', '2023-07-15T09:00:00.000Z', 16200, '2023-07-15T08:00:00.000Z', 'w09-mec1@seeder.com'],
    // Owner delivered + unverified (5)
    ['AB123CD', null, null, 'delivered', 'owner', 'unverified', '2023-02-20T09:00:00.000Z', 13400, '2023-02-20T08:00:00.000Z', null],
    ['AC234DE', null, null, 'delivered', 'owner', 'unverified', '2022-03-10T09:00:00.000Z', 15500, '2022-03-10T08:00:00.000Z', null],
    ['AC678DE', null, null, 'delivered', 'owner', 'unverified', '2021-11-01T09:00:00.000Z', 9800, '2021-11-01T08:00:00.000Z', null],
    ['AC901DE', null, null, 'delivered', 'owner', 'unverified', '2024-01-18T09:00:00.000Z', 2300, '2024-01-18T08:00:00.000Z', null],
    ['AD345EF', null, null, 'delivered', 'owner', 'unverified', '2026-06-15T09:00:00.000Z', 81900, '2026-06-15T08:00:00.000Z', null],
  ];

  let created = 0;
  for (let i = 0; i < episodesData.length; i++) {
    const [plate, workshopTaxId, workerEmail, status, source, verification, serviceDate, mileageIn, createdAt, verifiedEmail] = episodesData[i];

    const vehicle = await prisma.vehicle.findUnique({
      where: { licensePlate: plate },
    });
    if (!vehicle) continue;

    // Owner-source: createdByUserId = propietario actual del vehículo.
    // Workshop-source: createdByMemberId = worker del taller.
    let createdByUserId: string | null = null;
    let createdByMemberId: string | null = null;
    let workshopId: string | null = null;
    let branchId: string | null = null;
    let workshopName: string | null = null;

    if (source === 'owner') {
      const activeOwnership = await prisma.vehicleOwnership.findFirst({
        where: { vehicleId: vehicle.id, endsAt: null },
      });
      if (activeOwnership?.userId) createdByUserId = activeOwnership.userId;
      // workshopName: nombre del taller donde se realizó la atención.
      workshopName = verifiedEmail?.split('-')[0] === 'w' ? null : 'Servicio particular';
    } else {
      const worker = workerEmail
        ? await (async () => {
            const code = workerEmail.split('-')[0];
            const taxId = workshopTaxIds[code];
            return taxId ? findWorkshopMember(taxId, workerEmail) : null;
          })()
        : null;
      if (worker) {
        createdByMemberId = worker.id;
        workshopId = worker.workshopId;
        const branch = await findHeadquarters(worker.workshopId);
        if (branch) branchId = branch.id;
        const workshop = await prisma.workshop.findUnique({
          where: { id: worker.workshopId },
        });
        if (workshop) workshopName = workshop.name;
      }
    }

    if (source === 'workshop' && !createdByMemberId) continue;

    let verifiedByMemberId: string | null = null;
    let verifiedAt: string | null = null;
    if (verification === 'verified' && verifiedEmail) {
      if (source === 'owner' && verifiedEmail.split('-')[0] === 'w') {
        const code = verifiedEmail.split('-')[0];
        const taxId = workshopTaxIds[code];
        const member = taxId ? await findWorkshopMember(taxId, verifiedEmail) : null;
        verifiedByMemberId = member?.id ?? null;
      } else if (source === 'owner' && verifiedEmail.includes('svc')) {
        // Miembro de un service oficial: el email es del worker del service.
        const code = verifiedEmail.split('-')[0];
        const taxId = workshopTaxIds[`${code}-svc`];
        const member = taxId ? await findWorkshopMember(taxId, verifiedEmail) : null;
        verifiedByMemberId = member?.id ?? null;
      } else if (source === 'owner' && verifiedEmail.includes('matias-seller1')) {
        verifiedByMemberId = null; // sellers de concesionaria no son workshop members
      } else if (source === 'workshop' && createdByMemberId) {
        // Mismo taller: puede verificar otro miembro o el mismo worker.
        const member = await findWorkshopMember(workshopTaxIds[verifiedEmail.split('-')[0]], verifiedEmail);
        verifiedByMemberId = member?.id ?? null;
      }
      verifiedAt = serviceDate;
    }

    const id = det(600 + created);

    await prisma.careEpisode.upsert({
      where: { id },
      update: {},
      create: {
        id,
        vehicleId: vehicle.id,
        workshopId,
        branchId,
        createdByMemberId,
        createdByUserId,
        status: status as CareEpisodeStatus,
        source: source as CareEpisodeSource,
        verification: verification as CareEpisodeVerification,
        title: null,
        serviceDate: new Date(serviceDate),
        workshopName,
        mileageIn,
        checkedInAt: new Date(createdAt),
        closedAt: status === 'delivered' || status === 'cancelled' ? new Date(serviceDate) : null,
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
        verifiedByMemberId,
        verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
      },
    });
    created++;
  }

  const count = await prisma.careEpisode.count();
  console.log(`  ✓ ${created} care episodes upserted — total ${count}`);
}

async function main() {
  console.log('\n🌱 Seeding database...\n');

  await seedPermissions();
  await seedSystemRoles();
  await seedVehicleCatalog();
  await seedUsers();
  await seedWorkshops();
  await seedSystemWorkshopRolePermissions();
  await seedDealerships();
  await seedSystemDealershipRolePermissions();
  await seedSpecialties();
  await seedWorkshopSpecialties();
  await seedVehicles();
  await seedTransfers();
  await seedTransferEvents();
  await seedOwnerships();
  await seedMileages();
  await seedCareEpisodes();

  console.log('\n✅ Seed completed successfully\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
