import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetAppointmentHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        vehicle: { select: { id: true, licensePlate: true } },
        workshop: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment', id);
    return appointment;
  }
}
