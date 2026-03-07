import Database from 'better-sqlite3';

export function createReadConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath, { readonly: true });
  db.pragma('busy_timeout = 5000');
  db.pragma('query_only = true');
  return db;
}
