import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../common/database/prisma.service';
import { ChangePasswordDto } from '../../dto/change-password.dto';

@Injectable()
export class ChangePasswordHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, dto: ChangePasswordDto): Promise<void> {
    const credential = await this.prisma.userCredential.findUnique({
      where: { userId },
    });

    if (!credential) {
      throw new UnauthorizedException('Credenciales no encontradas');
    }

    const valid = await bcrypt.compare(
      dto.currentPassword,
      credential.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.userCredential.update({
      where: { userId },
      data: { passwordHash: newHash },
    });
  }
}
