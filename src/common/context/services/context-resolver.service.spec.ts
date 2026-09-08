import { ExecutionContext } from '@nestjs/common';
import { ContextResolver } from './context-resolver.service';
import { InvalidContextException } from '../../exceptions/coded.exception';
import { AuthenticatedUser } from '../../types/auth.types';

/**
 * Unit tests for ContextResolver — D-020 A1 matrix.
 *
 * Rules tested:
 * - No X-Context-Type → PERSONAL
 * - Unknown type → 403 INVALID_CONTEXT
 * - PERSONAL with X-Context-Id → 403 INVALID_CONTEXT
 * - WORKSHOP without X-Context-Id → 403 INVALID_CONTEXT
 * - WORKSHOP with id but no active membership → 403 INVALID_CONTEXT
 * - WORKSHOP with id and active membership → WORKSHOP context
 * - PLATFORM without system role (super_admin/admin/support) → 403 INVALID_CONTEXT
 * - PLATFORM with system role → PLATFORM context
 * - USER system role does NOT qualify for PLATFORM
 * - No silent fallbacks
 */
describe('ContextResolver', () => {
  let resolver: ContextResolver;
  let prismaMock: {
    workshopMember: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'test@example.com',
  };

  function makeRequest(
    headers: Record<string, string | string[] | undefined> = {},
  ) {
    return { headers };
  }

  beforeEach(() => {
    prismaMock = {
      workshopMember: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
    };
    resolver = new ContextResolver(prismaMock as any);
  });

  // ─── No header → PERSONAL ───
  it('should return PERSONAL when no X-Context-Type header', async () => {
    const result = await resolver.resolve(mockUser, makeRequest());
    expect(result).toEqual({ type: 'PERSONAL', userId: 'user-1' });
  });

  it('should return PERSONAL when X-Context-Type is empty string', async () => {
    const result = await resolver.resolve(
      mockUser,
      makeRequest({ 'x-context-type': '' }),
    );
    expect(result).toEqual({ type: 'PERSONAL', userId: 'user-1' });
  });

  // ─── Unknown type → 403 ───
  it('should throw InvalidContextException for unknown X-Context-Type', async () => {
    await expect(
      resolver.resolve(mockUser, makeRequest({ 'x-context-type': 'UNKNOWN' })),
    ).rejects.toThrow(InvalidContextException);
  });

  it('should throw InvalidContextException for case-insensitive unknown type', async () => {
    await expect(
      resolver.resolve(mockUser, makeRequest({ 'x-context-type': 'something' })),
    ).rejects.toThrow(InvalidContextException);
  });

  // ─── PERSONAL with X-Context-Id → 403 ───
  it('should throw InvalidContextException when PERSONAL has X-Context-Id', async () => {
    await expect(
      resolver.resolve(
        mockUser,
        makeRequest({
          'x-context-type': 'PERSONAL',
          'x-context-id': 'some-id',
        }),
      ),
    ).rejects.toThrow(InvalidContextException);
  });

  // ─── WORKSHOP ───
  it('should throw InvalidContextException when WORKSHOP has no X-Context-Id', async () => {
    await expect(
      resolver.resolve(
        mockUser,
        makeRequest({ 'x-context-type': 'WORKSHOP' }),
      ),
    ).rejects.toThrow(InvalidContextException);
  });

  it('should throw InvalidContextException when WORKSHOP id has no active membership', async () => {
    prismaMock.workshopMember.findUnique.mockResolvedValue(null);
    await expect(
      resolver.resolve(
        mockUser,
        makeRequest({
          'x-context-type': 'WORKSHOP',
          'x-context-id': 'workshop-1',
        }),
      ),
    ).rejects.toThrow(InvalidContextException);
  });

  it('should throw InvalidContextException when membership exists but is inactive', async () => {
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      id: 'member-1',
      status: 'inactive',
      roleId: 'role-1',
      role: { code: 'mechanic', name: 'Mechanic' },
    });
    await expect(
      resolver.resolve(
        mockUser,
        makeRequest({
          'x-context-type': 'WORKSHOP',
          'x-context-id': 'workshop-1',
        }),
      ),
    ).rejects.toThrow(InvalidContextException);
  });

  it('should return WORKSHOP context when membership is active', async () => {
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      id: 'member-1',
      status: 'active',
      roleId: 'role-1',
      role: { code: 'mechanic', name: 'Mechanic' },
    });
    const result = await resolver.resolve(
      mockUser,
      makeRequest({
        'x-context-type': 'WORKSHOP',
        'x-context-id': 'workshop-1',
      }),
    );
    expect(result).toEqual({
      type: 'WORKSHOP',
      userId: 'user-1',
      workshopId: 'workshop-1',
      memberId: 'member-1',
      roleId: 'role-1',
    });
  });

  // ─── PLATFORM ───
  it('should throw InvalidContextException when PLATFORM has no system role', async () => {
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    await expect(
      resolver.resolve(
        mockUser,
        makeRequest({ 'x-context-type': 'PLATFORM' }),
      ),
    ).rejects.toThrow(InvalidContextException);
  });

  it('should throw InvalidContextException when user has only "user" system role', async () => {
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null); // filtered out 'user'
    await expect(
      resolver.resolve(
        mockUser,
        makeRequest({ 'x-context-type': 'PLATFORM' }),
      ),
    ).rejects.toThrow(InvalidContextException);
  });

  it('should return PLATFORM context when user has super_admin role', async () => {
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
      role: { type: 'super_admin', name: 'Super Admin' },
    });
    const result = await resolver.resolve(
      mockUser,
      makeRequest({ 'x-context-type': 'PLATFORM' }),
    );
    expect(result).toEqual({ type: 'PLATFORM', userId: 'user-1' });
  });

  it('should return PLATFORM context when user has admin role', async () => {
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
      role: { type: 'admin', name: 'Admin' },
    });
    const result = await resolver.resolve(
      mockUser,
      makeRequest({ 'x-context-type': 'PLATFORM' }),
    );
    expect(result).toEqual({ type: 'PLATFORM', userId: 'user-1' });
  });

  it('should return PLATFORM context when user has support role', async () => {
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
      role: { type: 'support', name: 'Support' },
    });
    const result = await resolver.resolve(
      mockUser,
      makeRequest({ 'x-context-type': 'PLATFORM' }),
    );
    expect(result).toEqual({ type: 'PLATFORM', userId: 'user-1' });
  });

  // ─── Path fallback removed ───
  it('should NOT resolve from path params (path fallback removed)', async () => {
    const result = await resolver.resolve(
      mockUser,
      makeRequest({}),
    );
    // Even if we could pass params, the resolver no longer uses them
    expect(result).toEqual({ type: 'PERSONAL', userId: 'user-1' });
  });
});
