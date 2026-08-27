import { PrismaClient, SystemRoleType, MemberStatus } from '@prisma/client';
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
    'admin.roles.list',
    'admin.users.list',
    'admin.users.read',
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
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
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
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
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
      where: { id: '00000000-0000-0000-0000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000003',
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
      where: { id: '00000000-0000-0000-0000-000000000004' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000004',
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
      where: { id: '00000000-0000-0000-0000-000000000005' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000005',
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
      where: { id: '00000000-0000-0000-0000-000000000006' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000006',
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
      where: { id: '00000000-0000-0000-0000-000000000007' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000007',
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
      where: { id: '00000000-0000-0000-0000-000000000008' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000008',
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
      where: { id: '00000000-0000-0000-0000-000000000009' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000009',
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

  console.log('  ✓ 9 vehicle versions seeded');
}

async function seedUsers() {
  const password = await bcrypt.hash('Seeder123!', 10);

  const usersData = [
    {
      email: 'super@admin.com',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
    },
    {
      email: 'admin1@seeder.com',
      firstName: 'Carlos',
      lastName: 'García',
      role: 'admin',
    },
    {
      email: 'admin2@seeder.com',
      firstName: 'María',
      lastName: 'López',
      role: 'admin',
    },
    {
      email: 'admin3@seeder.com',
      firstName: 'Juan',
      lastName: 'Martínez',
      role: 'admin',
    },
    {
      email: 'admin4@seeder.com',
      firstName: 'Ana',
      lastName: 'Rodríguez',
      role: 'admin',
    },
    {
      email: 'support1@seeder.com',
      firstName: 'Pedro',
      lastName: 'Fernández',
      role: 'support',
    },
    {
      email: 'support2@seeder.com',
      firstName: 'Laura',
      lastName: 'Díaz',
      role: 'support',
    },
    {
      email: 'support3@seeder.com',
      firstName: 'Diego',
      lastName: 'Torres',
      role: 'support',
    },
    {
      email: 'support4@seeder.com',
      firstName: 'Sofía',
      lastName: 'Ramírez',
      role: 'support',
    },
    {
      email: 'support5@seeder.com',
      firstName: 'Luis',
      lastName: 'Morales',
      role: 'support',
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

async function seedWorkshops() {
  const workshopsData = [
    {
      name: 'Taller Mecánico Central',
      taxId: '30-12345678-9',
      email: 'central@taller.com',
      phone: '011-4567-8901',
      ownerEmail: 'admin1@seeder.com',
    },
    {
      name: 'AutoServicios del Sur',
      taxId: '30-23456789-0',
      email: 'surservicios@taller.com',
      phone: '011-5678-9012',
      ownerEmail: 'admin1@seeder.com',
    },
    {
      name: 'Mecánica Rápida',
      taxId: '30-34567890-1',
      email: 'rapida@taller.com',
      phone: '011-6789-0123',
      ownerEmail: 'admin2@seeder.com',
    },
    {
      name: 'Taller Especializado',
      taxId: '30-45678901-2',
      email: 'especializado@taller.com',
      phone: '011-7890-1234',
      ownerEmail: 'admin2@seeder.com',
    },
    {
      name: 'Diagnóstico y Reparación',
      taxId: '30-56789012-3',
      email: 'diagnostico@taller.com',
      phone: '011-8901-2345',
      ownerEmail: 'admin3@seeder.com',
    },
    {
      name: 'Chapa y Pintura',
      taxId: '30-67890123-4',
      email: 'chapapintura@taller.com',
      phone: '011-9012-3456',
      ownerEmail: 'admin3@seeder.com',
    },
    {
      name: 'Taller Integral',
      taxId: '30-78901234-5',
      email: 'integral@taller.com',
      phone: '011-0123-4567',
      ownerEmail: 'admin4@seeder.com',
    },
    {
      name: 'Mecánica Diesel',
      taxId: '30-89012345-6',
      email: 'diesel@taller.com',
      phone: '011-1234-5678',
      ownerEmail: 'admin4@seeder.com',
    },
    {
      name: 'Electricidad Automotriz',
      taxId: '30-90123456-7',
      email: 'electro@taller.com',
      phone: '011-2345-6789',
      ownerEmail: 'admin3@seeder.com',
    },
    {
      name: 'Taller de Confianza',
      taxId: '30-01234567-8',
      email: 'confianza@taller.com',
      phone: '011-3456-7890',
      ownerEmail: 'admin2@seeder.com',
    },
  ];

  const employeePool = [
    'user1@seeder.com',
    'user2@seeder.com',
    'user3@seeder.com',
    'user4@seeder.com',
    'user5@seeder.com',
    'user6@seeder.com',
    'user7@seeder.com',
    'user8@seeder.com',
    'user9@seeder.com',
    'user10@seeder.com',
    'user11@seeder.com',
    'user12@seeder.com',
    'support1@seeder.com',
    'support2@seeder.com',
    'support3@seeder.com',
  ];

  let assignmentIndex = 0;

  for (const w of workshopsData) {
    const existingWorkshop = await prisma.workshop.findUnique({
      where: { taxId: w.taxId },
    });
    if (existingWorkshop) continue;

    const owner = await prisma.user.findUnique({
      where: { email: w.ownerEmail },
    });
    if (!owner) continue;

    const workshop = await prisma.workshop.create({
      data: {
        name: w.name,
        taxId: w.taxId,
        email: w.email,
        phone: w.phone,
        isActive: true,
      },
    });

    const branch = await prisma.workshopBranch.create({
      data: {
        workshopId: workshop.id,
        name: 'Sede Central',
        isHeadquarters: true,
        city: 'Buenos Aires',
        state: 'CABA',
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

    await prisma.workshopMember.create({
      data: {
        workshopId: workshop.id,
        userId: owner.id,
        roleId: ownerRole.id,
        defaultBranchId: branch.id,
        status: MemberStatus.active,
        joinedAt: new Date(),
        acceptedAt: new Date(),
      },
    });

    const employeeCount = 2 + (assignmentIndex % 3);
    for (let i = 0; i < employeeCount; i++) {
      const empEmail =
        employeePool[(assignmentIndex + i) % employeePool.length];
      const empUser = await prisma.user.findUnique({
        where: { email: empEmail },
      });
      if (!empUser) continue;

      const existingMember = await prisma.workshopMember.findUnique({
        where: {
          workshopId_userId: { workshopId: workshop.id, userId: empUser.id },
        },
      });
      if (existingMember) continue;

      const role = i === 0 ? mechanicRole : employeeRole;
      await prisma.workshopMember.create({
        data: {
          workshopId: workshop.id,
          userId: empUser.id,
          roleId: role.id,
          defaultBranchId: branch.id,
          status: MemberStatus.active,
          joinedAt: new Date(),
          acceptedAt: new Date(),
        },
      });
    }
    assignmentIndex++;
  }

  const count = await prisma.workshop.count();
  console.log(`  ✓ ${count} workshops seeded`);
}

async function main() {
  console.log('\n🌱 Seeding database...\n');

  await seedPermissions();
  await seedSystemRoles();
  await seedVehicleCatalog();
  await seedUsers();
  await seedWorkshops();

  console.log('\n✅ Seed completed successfully\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
