import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UpdateDealershipStatusHandler } from './update-dealership-status.handler';
import { UpdateDealershipStatusCommand } from './update-dealership-status.command';

/**
 * P2: toggle de `isActive` de la concesionaria.
 *
 * Cubre: deshabilitar (update + evento con actor), habilitar (reason),
 * 404 inexistente/soft-delete y updatedByRole 'user' sin system roles.
 */
describe('UpdateDealershipStatusHandler (admin) — P2 toggle isActive', () => {
  let handler: UpdateDealershipStatusHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const adminUser = { id: 'admin-1', email: 'admin@test.com' };

  const baseDealership = {
    id: 'd1',
    name: 'Concesionaria Norte',
    status: 'active',
    isActive: true,
    deletedAt: null,
  };

  const adminAssignments = [{ role: { type: 'admin', priority: 80 } }];

  beforeEach(() => {
    prismaMock = {
      dealership: {
        findUnique: jest.fn().mockResolvedValue({ ...baseDealership }),
        update: jest.fn().mockResolvedValue({ ...baseDealership }),
      },
      systemRoleAssignment: { findMany: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new UpdateDealershipStatusHandler(
      prismaMock,
      eventEmitterMock as unknown as EventEmitter2,
    );
    prismaMock.systemRoleAssignment.findMany.mockResolvedValue(
      adminAssignments,
    );
  });

  const execute = (isActive: boolean, reason?: string) =>
    handler.execute(
      new UpdateDealershipStatusCommand('d1', isActive, reason),
      adminUser,
    );

  it('deshabilita y emite admin.dealership.status_changed con actor', async () => {
    await execute(false);

    expect(prismaMock.dealership.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { isActive: false },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'admin.dealership.status_changed',
      expect.objectContaining({
        dealershipId: 'd1',
        isActive: false,
        updatedById: 'admin-1',
        updatedByRole: 'admin',
      }),
    );
  });

  it('habilita y propaga el reason opcional en el evento', async () => {
    await execute(true, 'revisión manual completada');

    expect(prismaMock.dealership.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { isActive: true },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'admin.dealership.status_changed',
      expect.objectContaining({
        isActive: true,
        reason: 'revisión manual completada',
      }),
    );
  });

  it('404: concesionaria inexistente', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(execute(false)).rejects.toThrow(NotFoundException);
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('404: concesionaria soft-deleteada', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      ...baseDealership,
      deletedAt: new Date(),
    });

    await expect(execute(false)).rejects.toThrow(NotFoundException);
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
  });

  it('sin system roles → updatedByRole user', async () => {
    prismaMock.systemRoleAssignment.findMany.mockResolvedValue([]);

    await execute(false);

    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'admin.dealership.status_changed',
      expect.objectContaining({ updatedByRole: 'user' }),
    );
  });
});
