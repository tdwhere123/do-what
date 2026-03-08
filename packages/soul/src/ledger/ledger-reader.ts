import fs from 'node:fs/promises';
import {
  UserDecisionFilterSchema,
  UserDecisionSchema,
  type UserDecision,
  type UserDecisionFilter,
} from '@do-what/protocol';

export interface LedgerReaderOptions {
  ledgerPath: string;
  warn?: (message: string, error?: unknown) => void;
}

function shouldInclude(
  decision: UserDecision,
  filter: UserDecisionFilter | undefined,
): boolean {
  if (!filter) {
    return true;
  }

  if (filter.decision_type && decision.decision_type !== filter.decision_type) {
    return false;
  }

  if (filter.linked_memory_id && decision.linked_memory_id !== filter.linked_memory_id) {
    return false;
  }

  if (filter.since) {
    const decisionTimestamp = Date.parse(decision.timestamp);
    const sinceTimestamp = Date.parse(filter.since);
    if (Number.isFinite(sinceTimestamp) && Number.isFinite(decisionTimestamp)) {
      return decisionTimestamp >= sinceTimestamp;
    }
  }

  return true;
}

export class LedgerReader {
  private readonly ledgerPath: string;
  private readonly warn: (message: string, error?: unknown) => void;

  constructor(options: LedgerReaderOptions) {
    this.ledgerPath = options.ledgerPath;
    this.warn = options.warn ?? ((message, error) => console.warn(message, error));
  }

  async read(filter?: UserDecisionFilter): Promise<UserDecision[]> {
    const parsedFilter = filter
      ? UserDecisionFilterSchema.parse(filter)
      : undefined;
    const content = await this.readFile();
    if (!content) {
      return [];
    }

    const decisions: UserDecision[] = [];
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) {
        continue;
      }

      try {
        const parsed = UserDecisionSchema.parse(JSON.parse(line));
        if (shouldInclude(parsed, parsedFilter)) {
          decisions.push(parsed);
        }
      } catch (error) {
        this.warn('[soul][ledger] skipping corrupt ledger line', error);
      }
    }

    return decisions;
  }

  private async readFile(): Promise<string> {
    try {
      return await fs.readFile(this.ledgerPath, 'utf8');
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }
}
