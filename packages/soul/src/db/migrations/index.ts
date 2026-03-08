import type { SoulDbMigration } from '../migration-runner.js';
import { v1Migration } from './v1.js';
import { v2Migration } from './v2.js';
import { v3Migration } from './v3.js';
import { v4Migration } from './v4.js';
import { v5Migration } from './v5.js';
import { v6Migration } from './v6.js';

export const SOUL_DB_MIGRATIONS: readonly SoulDbMigration[] = [
  v1Migration,
  v2Migration,
  v3Migration,
  v4Migration,
  v5Migration,
  v6Migration,
];

export { v1Migration };
export { v2Migration };
export { v3Migration };
export { v4Migration };
export { v5Migration };
export { v6Migration };
