import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UserVerifiedEvent } from '../../events/user-verified.event';
import { VerifyEmailDto } from '../../dto/verify-email.dto';

@Injectable()
export class VerifyEmailHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(dto: VerifyEmailDto): Promise<string> {
    const record = await this.prisma.emailVerification.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!record) {
      throw new NotFoundException('Token inválido');
    }

    if (record.verifiedAt) {
      throw new BadRequestException('Token ya utilizado');
    }

    if (new Date() > record.expiresAt) {
      throw new BadRequestException('Token expirado');
    }

    if (record.user.status === 'active') {
      return 'Email ya verificado';
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { verifiedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { status: 'active', emailVerifiedAt: new Date() },
      }),
    ]);

    this.eventEmitter.emit(
      'auth.user.verified',
      new UserVerifiedEvent(record.userId),
    );
    return 'Email verificado con éxito';
  }
}
