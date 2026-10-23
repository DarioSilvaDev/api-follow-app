/**
 * Structural consistency test between @Permissions annotations in controllers
 * and the permissions seeded in prisma/seed.ts.
 *
 * Lote 1 (BE-001): ensures that the permissions referenced by the codebase
 * are present in the seed's permissions array and role mappings.
 *
 * NOTE: The enunciado originally mentions a "manager" role but the current
 * project only defines owner/mechanic/employee for workshop system roles.
 * This test does not enforce a non-existent manager role; instead it
 * validates the set of permission codes actually used in the codebase.
 */
import { globSync } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

const permissionsRegex = /@Permissions\(([^)]+)\)/g;
const quoteRegex = /['"]([^'"]+)['"]/g;

function extractPermissionCodesFromFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const codes: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = permissionsRegex.exec(content)) !== null) {
    const inner = match[1];
    let q: RegExpExecArray | null;
    while ((q = quoteRegex.exec(inner)) !== null) {
      codes.push(q[1]);
    }
  }

  return codes;
}

describe('Permissions <-> seed consistency (Lote 1)', () => {
  const srcDir = path.join(__dirname, '../../..');
  const controllerFiles = globSync('src/modules/**/controllers/**/*.ts', {
    cwd: srcDir,
    absolute: true,
  });

  const codePermissionCodes = new Set<string>();
  for (const file of controllerFiles) {
    const codes = extractPermissionCodesFromFile(file);
    for (const c of codes) {
      codePermissionCodes.add(c);
    }
  }

  // Import seed to get permissions array (uses CommonJS but is TS; we can read source)
  const seedPath = path.join(process.cwd(), 'prisma', 'seed.ts');
  const seedContent = fs.readFileSync(seedPath, 'utf-8');

  const seedPermissionCodes = new Set<string>();
  // match code: '<...>'
  const seedCodeRegex = /code:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = seedCodeRegex.exec(seedContent)) !== null) {
    seedPermissionCodes.add(m[1]);
  }

  it('all permission codes used in @Permissions exist in seed permissions array', () => {
    const missing = Array.from(codePermissionCodes).filter(
      (c) => !seedPermissionCodes.has(c),
    );
    expect(missing).toEqual([]);
  });

  it('workshop system roles in seed include the 4 workshop.* permissions requested', () => {
    const ownerMatch = seedContent.match(
      /systemWorkshopRolePermissions\s*:\s*Record<string,\s*string\[\]>\s*=\s*\{[^}]*owner\s*:\s*\[([\s\S]*?)\n {2}\]/m,
    );
    expect(ownerMatch).not.toBeNull();
    const ownerBlock = ownerMatch ? ownerMatch[1] : '';
    const required = [
      'workshop.specialties.manage',
      'workshop.roles.create',
      'workshop.roles.update',
      'workshop.roles.delete',
    ];
    for (const r of required) {
      expect(ownerBlock).toContain(r);
    }
  });

  it('admin system role includes specialties and extra workshop admin perms', () => {
    const adminMatch = seedContent.match(
      /\[SystemRoleType\.admin\]\s*:\s*\[([\s\S]*?)\n {2}\]/m,
    );
    expect(adminMatch).not.toBeNull();
    const adminBlock = adminMatch ? adminMatch[1] : '';
    const required = [
      'admin.specialties.list',
      'admin.specialties.create',
      'admin.specialties.update',
      'admin.specialties.delete',
      'admin.workshops.roles',
      'admin.workshops.branches',
    ];
    for (const r of required) {
      expect(adminBlock).toContain(r);
    }
  });

  it('constants mirror seed for owner workshop permissions', () => {
    const constPath = path.join(
      process.cwd(),
      'src',
      'modules',
      'workshops',
      'workshops.constants.ts',
    );
    const constContent = fs.readFileSync(constPath, 'utf-8');
    const required = [
      'workshop.specialties.manage',
      'workshop.roles.create',
      'workshop.roles.update',
      'workshop.roles.delete',
    ];
    for (const r of required) {
      expect(constContent).toContain(r);
    }
  });
});
