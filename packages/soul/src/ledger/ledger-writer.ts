import fs from 'node:fs/promises';
import path from 'node:path';
import {
  UserDecisionSchema,
  type UserDecision,
  type UserDecisionFilter,
} from '@do-what/protocol';
import { LedgerReader } from './ledger-reader.js';

export interface LedgerWriterOptions {
  ledgerPath: string;
  warn?: (message: string, error?: unknown) => void;
}

export class LedgerWriter {
  private readonly ledgerPath: string;
  private readonly reader: LedgerReader;

  constructor(options: LedgerWriterOptions) {
    this.ledgerPath = options.ledgerPath;
    this.reader = new LedgerReader({
      ledgerPath: options.ledgerPath,
      warn: options.warn,
    });
  }

  async append(decision: UserDecision): Promise<void> {
    const parsed = UserDecisionSchema.parse(normalizeDecision(decision));
    await fs.mkdir(path.dirname(this.ledgerPath), { recursive: true });
    const handle = await fs.open(this.ledgerPath, 'a', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(parsed)}\n`, 'utf8');
      await handle.chmod(0o600).catch(() => undefined);
    } finally {
      await handle.close();
    }
  }

  async read(filter?: UserDecisionFilter): Promise<UserDecision[]> {
    return this.reader.read(filter);
  }
}

function normalizeDecision(decision: UserDecision): UserDecision {
  if (typeof decision.user_note !== 'string' || decision.user_note.length <= 500) {
    return decision;
  }

  return {
    ...decision,
    user_note: decision.user_note.slice(0, 500),
  };
}
