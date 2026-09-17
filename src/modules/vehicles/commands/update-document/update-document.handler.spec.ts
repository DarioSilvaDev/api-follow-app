import { NotFoundException } from '@nestjs/common';
import { UpdateDocumentHandler } from './update-document.handler';
import { UpdateDocumentCommand } from './update-document.command';

describe('UpdateDocumentHandler — F-013 document metadata (D-043 / D-049)', () => {
  let handler: UpdateDocumentHandler;
  let prismaMock: {
    vehicleDocument: { findFirst: jest.Mock; update: jest.Mock };
  };

  const existingDoc = {
    id: 'doc-1',
    vehicleId: 'v1',
    key: 'vehicles/v1/documents/doc.pdf',
    name: 'Insurance',
    documentType: 'insurance',
    expiresAt: new Date('2026-12-31'),
  };

  beforeEach(() => {
    prismaMock = {
      vehicleDocument: { findFirst: jest.fn(), update: jest.fn() },
    };
    handler = new UpdateDocumentHandler(prismaMock as any);
  });

  it('throws NotFoundException (404) when the document does not belong to the vehicle', async () => {
    prismaMock.vehicleDocument.findFirst.mockResolvedValue(null);

    const cmd = new UpdateDocumentCommand('v1', 'doc-1', { name: 'X' });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prismaMock.vehicleDocument.update).not.toHaveBeenCalled();
  });

  it('does not touch expiresAt when the field is not sent (D-049: omitted → untouched)', async () => {
    prismaMock.vehicleDocument.findFirst.mockResolvedValue(existingDoc);
    prismaMock.vehicleDocument.update.mockResolvedValue({
      ...existingDoc,
      name: 'Renamed',
    });

    const cmd = new UpdateDocumentCommand('v1', 'doc-1', { name: 'Renamed' });

    await handler.execute(cmd);

    const updateCall = prismaMock.vehicleDocument.update.mock.calls[0];
    expect(updateCall[0].where).toEqual({ id: 'doc-1' });
    expect(updateCall[0].data).toHaveProperty('name', 'Renamed');
    // Jamás se incluye expiresAt (ni undefined, ni new Date(null)).
    expect(updateCall[0].data).not.toHaveProperty('expiresAt');
  });

  it('stores null when expiresAt: null is sent explicitly (D-049: clear optional → null)', async () => {
    prismaMock.vehicleDocument.findFirst.mockResolvedValue(existingDoc);
    prismaMock.vehicleDocument.update.mockResolvedValue({
      ...existingDoc,
      name: 'Insurance',
      expiresAt: null,
    });

    const cmd = new UpdateDocumentCommand('v1', 'doc-1', { expiresAt: null });

    await handler.execute(cmd);

    const updateCall = prismaMock.vehicleDocument.update.mock.calls[0];
    expect(updateCall[0].data).toHaveProperty('expiresAt');
    expect(updateCall[0].data.expiresAt).toBeNull();
    // Regresión del bug: new Date(null) === epoch 1970-01-01, nunca debe ocurrir.
    expect(updateCall[0].data.expiresAt).not.toBeInstanceOf(Date);
    expect(updateCall[0].data.expiresAt).not.toEqual(new Date(null));
  });

  it('stores new Date(value) when a valid date string is sent', async () => {
    prismaMock.vehicleDocument.findFirst.mockResolvedValue(existingDoc);
    prismaMock.vehicleDocument.update.mockResolvedValue({
      ...existingDoc,
      expiresAt: new Date('2027-06-30'),
    });

    const cmd = new UpdateDocumentCommand('v1', 'doc-1', {
      expiresAt: '2027-06-30',
    });

    await handler.execute(cmd);

    const updateCall = prismaMock.vehicleDocument.update.mock.calls[0];
    expect(updateCall[0].data.expiresAt).toEqual(new Date('2027-06-30'));
    expect(updateCall[0].data.expiresAt).toBeInstanceOf(Date);
  });
});
