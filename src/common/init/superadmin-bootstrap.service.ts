import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { envs } from '../../config/envs';

@Injectable()
export class SuperadminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperadminBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (!envs.SUPER_ADMIN_EMAIL || !envs.SUPER_ADMIN_PASS) {
      this.logger.warn(
        'SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASS not configured — skipping superadmin bootstrap',
      );
      return;
    }

    const existingSuperAdmin = await this.prisma.systemRoleAssignment.findFirst(
      {
        where: {
          role: { type: 'super_admin' },
        },
      },
    );

    if (existingSuperAdmin) {
      this.logger.log('Superadmin already exists — skipping bootstrap');
      return;
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: envs.SUPER_ADMIN_EMAIL },
    });

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      this.logger.log(
        `User ${envs.SUPER_ADMIN_EMAIL} already exists — assigning super_admin role`,
      );
    } else {
      const passwordHash = await bcrypt.hash(envs.SUPER_ADMIN_PASS, 10);
      const user = await this.prisma.user.create({
        data: {
          email: envs.SUPER_ADMIN_EMAIL,
          firstName: 'Super',
          lastName: 'Admin',
          status: 'active',
          credential: {
            create: { passwordHash },
          },
        },
      });
      userId = user.id;
      this.logger.log(`Superadmin user ${envs.SUPER_ADMIN_EMAIL} created`);
    }

    const role = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
    });

    if (!role) {
      this.logger.error(
        'super_admin role not found — run prisma db seed first',
      );
      return;
    }

    await this.prisma.systemRoleAssignment.create({
      data: { userId, roleId: role.id },
    });

    this.logger.log(`Superadmin role assigned to ${envs.SUPER_ADMIN_EMAIL}`);
  }
}
