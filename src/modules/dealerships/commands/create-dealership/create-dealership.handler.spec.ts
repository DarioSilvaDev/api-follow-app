import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateDealershipHandler } from './create-dealership.handler';
import { CreateDealershipCommand } from './create-dealership.command';

describe('CreateDealershipHandler (D-103 alta rápida)', () => {
  let handler: CreateDealershipHandler;
  let repositoryMock: { create: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const dto = {
    name: 'Concesionaria Demo',
    legalName: 'Demo S.A.',
    email: 'contacto@demo.com',
  };

  beforeEach(() => {
    repositoryMock = { create: jest.fn() };
    eventEmitterMock = { emit: jest.fn() };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new CreateDealershipHandler(
      repositoryMock as any,
      eventEmitterMock as unknown as EventEmitter2,
      permissionCacheMock as any,
    );
  });

  it('creates the dealership with the ownerId and emits dealership.created', async () => {
    const dealership = { id: 'd-1', ...dto };
    repositoryMock.create.mockResolvedValue(dealership);

    const result = await handler.execute(
      new CreateDealershipCommand(dto as any, 'user-1'),
    );

    expect(result).toEqual(dealership);
    expect(repositoryMock.create).toHaveBeenCalledWith({
      ...dto,
      ownerId: 'user-1',
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'dealership.created',
      expect.objectContaining({ dealershipId: 'd-1', ownerId: 'user-1' }),
    );
  });

  it('invalidates the owner permission cache so the dealership scope resolves', async () => {
    repositoryMock.create.mockResolvedValue({ id: 'd-1', ...dto });

    await handler.execute(new CreateDealershipCommand(dto as any, 'user-1'));

    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('user-1');
  });
});