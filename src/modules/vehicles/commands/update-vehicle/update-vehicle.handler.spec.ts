import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { UpdateVehicleHandler } from './update-vehicle.handler';
import { UpdateVehicleCommand } from './update-vehicle.command';

describe('UpdateVehicleHandler — F-011 (D-039 / D-040 / D-042 / D-043)', () => {
  let handler: UpdateVehicleHandler;
  let repositoryMock: {
    findById: jest.Mock;
    update: jest.Mock;
  };

  const baseDto = {
    licensePlate: undefined,
    vin: undefined,
    engineNumber: undefined,
    versionId: undefined,
    manufactureYear: undefined,
    modelYear: undefined,
    color: undefined,
    notes: undefined,
  };

  const existingVehicle = { id: 'v1', licensePlate: 'ABC123' };

  beforeEach(() => {
    repositoryMock = {
      findById: jest.fn(),
      update: jest.fn(),
    };
    handler = new UpdateVehicleHandler(repositoryMock as any);
  });

  it('normalizes licensePlate (trim + uppercase) before calling update (D-042)', async () => {
    repositoryMock.findById.mockResolvedValue(existingVehicle);
    repositoryMock.update.mockResolvedValue({
      ...existingVehicle,
      licensePlate: 'ABC999',
      color: 'Rojo',
    });

    const cmd = new UpdateVehicleCommand('v1', {
      ...baseDto,
      licensePlate: '  abc999  ',
      color: 'Rojo',
    });

    const result = await handler.execute(cmd);

    expect(repositoryMock.findById).toHaveBeenCalledWith('v1');
    expect(repositoryMock.update).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        licensePlate: 'ABC999',
        color: 'Rojo',
      }),
    );
    // Nunca se guarda la placa sin normalizar.
    expect(repositoryMock.update).not.toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ licensePlate: '  abc999  ' }),
    );
    expect(result).toEqual({
      ...existingVehicle,
      licensePlate: 'ABC999',
      color: 'Rojo',
    });
  });

  it('passes the DTO through unchanged (no normalization) when licensePlate is not sent (D-040 PATCH parcial)', async () => {
    repositoryMock.findById.mockResolvedValue(existingVehicle);
    repositoryMock.update.mockResolvedValue({
      ...existingVehicle,
      color: 'Rojo',
    });

    const cmd = new UpdateVehicleCommand('v1', { ...baseDto, color: 'Rojo' });

    await handler.execute(cmd);

    // Sin licensePlate, el dto se reenvía tal cual (misma referencia) y no se
    // toca la placa existente.
    expect(repositoryMock.update).toHaveBeenCalledWith('v1', cmd.dto);
  });

  it('throws NotFoundException (404) when the vehicle does not exist (D-039)', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    const cmd = new UpdateVehicleCommand('v1', { ...baseDto, color: 'Rojo' });

    let caught: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NotFoundException);
    expect(caught.getResponse()).toEqual({
      statusCode: 404,
      message: "Vehicle with id 'v1' not found",
      error: 'Not Found',
    });
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('is a no-op (200) when the PATCH body is empty and does not call update (D-040)', async () => {
    repositoryMock.findById.mockResolvedValue(existingVehicle);

    const cmd = new UpdateVehicleCommand('v1', {});

    const result = await handler.execute(cmd);

    expect(repositoryMock.findById).toHaveBeenCalledWith('v1');
    // No se llama a prisma.vehicle.update({ data: {} }) (frágil): el registro
    // existente se devuelve tal cual sin tocar la DB.
    expect(repositoryMock.update).not.toHaveBeenCalled();
    expect(result).toEqual(existingVehicle);
  });

  // ── D-043: null explícito vacía campo opcional ─────────────────────────

  it('passes explicit null for color to the repository (D-043)', async () => {
    repositoryMock.findById.mockResolvedValue(existingVehicle);
    repositoryMock.update.mockResolvedValue({
      ...existingVehicle,
      color: null,
    });

    const cmd = new UpdateVehicleCommand('v1', { ...baseDto, color: null });

    await handler.execute(cmd);

    // Verificar que null llegó al repository (no undefined, no omitido)
    expect(repositoryMock.update).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ color: null }),
    );
    const updateCall = repositoryMock.update.mock.calls[0];
    expect(updateCall[1].color).toBeNull();
    expect(updateCall[1]).toHaveProperty('color');
  });

  it('passes explicit null for vin and engineNumber to the repository (D-043)', async () => {
    repositoryMock.findById.mockResolvedValue(existingVehicle);
    repositoryMock.update.mockResolvedValue({
      ...existingVehicle,
      vin: null,
      engineNumber: null,
    });

    const cmd = new UpdateVehicleCommand('v1', {
      ...baseDto,
      vin: null,
      engineNumber: null,
    });

    await handler.execute(cmd);

    expect(repositoryMock.update).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ vin: null, engineNumber: null }),
    );
    const updateCall = repositoryMock.update.mock.calls[0];
    expect(updateCall[1].vin).toBeNull();
    expect(updateCall[1].engineNumber).toBeNull();
  });

  it('passes explicit null for manufactureYear to the repository (D-043)', async () => {
    repositoryMock.findById.mockResolvedValue(existingVehicle);
    repositoryMock.update.mockResolvedValue({
      ...existingVehicle,
      manufactureYear: null,
    });

    const cmd = new UpdateVehicleCommand('v1', {
      ...baseDto,
      manufactureYear: null,
    });

    await handler.execute(cmd);

    expect(repositoryMock.update).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ manufactureYear: null }),
    );
    const updateCall = repositoryMock.update.mock.calls[0];
    expect(updateCall[1].manufactureYear).toBeNull();
  });

  it('still normalizes licensePlate when sent alongside null fields (D-042 + D-043)', async () => {
    repositoryMock.findById.mockResolvedValue(existingVehicle);
    repositoryMock.update.mockResolvedValue({
      ...existingVehicle,
      licensePlate: 'XYZ',
      color: null,
    });

    const cmd = new UpdateVehicleCommand('v1', {
      ...baseDto,
      licensePlate: ' xyz ',
      color: null,
    });

    await handler.execute(cmd);

    expect(repositoryMock.update).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        licensePlate: 'XYZ',
        color: null,
      }),
    );
  });
});