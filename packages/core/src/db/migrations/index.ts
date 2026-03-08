import type { DbMigration } from '../migration-runner.js';
import { v1Migration } from './v1.js';
import { v2Migration } from './v2.js';
import { v3Migration } from './v3.js';
import { v4Migration } from './v4.js';

export const DB_MIGRATIONS: readonly DbMigration[] = [
  v1Migration,
  v2Migration,
  v3Migration,
  v4Migration,
];

export { v1Migration };
export { v2Migration };
export { v3Migration };
export { v4Migration };
