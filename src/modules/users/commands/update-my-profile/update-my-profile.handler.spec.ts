import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UpdateMyProfileHandler } from './update-my-profile.handler';
import { UpdateMyProfileCommand } from './update-my-profile.command';

// Mock envs before the handler imports it, to avoid Joi validation failure.
jest.mock('../../../../config/envs', () => ({
  envs: {
    DEFAULT_PHONE_COUNTRY_CODE: '+54',
  },
}));

describe('UpdateMyProfileHandler — PATCH /users/me', () => {
  let handler: UpdateMyProfileHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const responseRow = {
    id: 'u-1',
    firstName: 'Ana',
    lastName: 'Pérez',
    phone: '+543413750611',
    phoneAreaCode: '341',
    phoneNationalNumber: '3750611',
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    eventEmitterMock = { emit: jest.fn() };

    handler = new UpdateMyProfileHandler(
      prismaMock,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  const command = (dto: any) => new UpdateMyProfileCommand('u-1', dto);

  it('empty body ({}) is a no-op: reads current state, never writes nor emits', async () => {
    prismaMock.user.findUnique.mockResolvedValue(responseRow);

    const result = await handler.execute(command({}));

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    expect(result).toEqual(responseRow);
  });

  it('no-op on a missing user throws NotFoundException', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(handler.execute(command({}))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates firstName/lastName (trimmed) and emits user.updated', async () => {
    prismaMock.user.update.mockResolvedValue({
      ...responseRow,
      firstName: 'María',
      lastName: 'González',
    });

    const result = await handler.execute(
      command({ firstName: '  María ', lastName: ' González ' }),
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { firstName: 'María', lastName: 'González' },
      select: expect.objectContaining({
        id: true,
        phoneAreaCode: true,
        phoneNationalNumber: true,
      }),
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'user.updated',
      expect.objectContaining({ userId: 'u-1' }),
    );
    expect(result.firstName).toBe('María');
  });

  it('sets a valid phone pair → E.164 + display split persisted', async () => {
    prismaMock.user.update.mockResolvedValue(responseRow);

    await handler.execute(
      command({ phone: { areaCode: '341', nationalNumber: '3750611' } }),
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          phone: '+543413750611',
          phoneAreaCode: '341',
          phoneNationalNumber: '3750611',
        },
      }),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
  });

  it('normalizes formatting (spaces/dashes/parens) before building E.164', async () => {
    prismaMock.user.update.mockResolvedValue(responseRow);

    await handler.execute(
      command({ phone: { areaCode: '(341)', nationalNumber: '375-06 11' } }),
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '+543413750611',
          phoneAreaCode: '341',
          phoneNationalNumber: '3750611',
        }),
      }),
    );
  });

  it('rejects an invalid pair (400) without writing', async () => {
    await expect(
      handler.execute(
        command({ phone: { areaCode: '3', nationalNumber: '1' } }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rejects a half-empty pair (area only) with 400', async () => {
    await expect(
      handler.execute(command({ phone: { areaCode: '341' } })),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('phone: null clears the phone (E.164 null, display parts emptied)', async () => {
    prismaMock.user.update.mockResolvedValue({
      ...responseRow,
      phone: null,
      phoneAreaCode: '',
      phoneNationalNumber: '',
    });

    await handler.execute(command({ phone: null }));

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { phone: null, phoneAreaCode: '', phoneNationalNumber: '' },
      }),
    );
  });

  it('phone object with both fields empty clears the phone', async () => {
    prismaMock.user.update.mockResolvedValue({
      ...responseRow,
      phone: null,
      phoneAreaCode: '',
      phoneNationalNumber: '',
    });

    await handler.execute(
      command({ phone: { areaCode: '', nationalNumber: '' } }),
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { phone: null, phoneAreaCode: '', phoneNationalNumber: '' },
      }),
    );
  });

  it('does not emit user.updated when nothing changed', async () => {
    prismaMock.user.findUnique.mockResolvedValue(responseRow);

    await handler.execute(command({}));

    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
