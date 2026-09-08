/**
 * Jest unit test configuration — HCDV backend.
 *
 * - rootDir: src → unit specs live next to their code (src/**\/*.spec.ts)
 * - ts-jest: transpiles TypeScript using the project tsconfig.json
 * - testEnvironment: node (NestJS backend, no DOM)
 *
 * @see package.json scripts.test ("jest")
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};