import type { DbMigration } from '../migration-runner.js';
import { v1Migration } from './v1.js';

export const DB_MIGRATIONS: readonly DbMigration[] = [v1Migration];

export { v1Migration };
