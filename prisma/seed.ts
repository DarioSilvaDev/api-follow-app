import { PrismaClient, SystemRoleType } from '@prisma/client';

const prisma = new PrismaClient();

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
  [SystemRoleType.admin]: ['admin.roles.list', 'admin.users.list'],
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

async function main() {
  console.log('\n🌱 Seeding database...\n');

  await seedPermissions();
  await seedSystemRoles();

  console.log('\n✅ Seed completed successfully\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
