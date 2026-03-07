import type { DbMigration } from '../migration-runner.js';
import { v1Migration } from './v1.js';
import { v2Migration } from './v2.js';

export const DB_MIGRATIONS: readonly DbMigration[] = [v1Migration, v2Migration];

export { v1Migration };
export { v2Migration };
