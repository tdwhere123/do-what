import type { BaseEvent } from '@do-what/protocol';

export interface SoulToolCall {
  arguments: unknown;
  name: string;
}

export interface SoulToolDispatcher {
  close: () => Promise<void>;
  dispatch: (call: SoulToolCall) => Promise<unknown>;
  getHealingStats: () => Promise<Record<string, unknown>>;
  hasTool: (name: string) => boolean;
  listPendingProposals: (projectId?: string) => Promise<readonly Record<string, unknown>[]>;
}

export type SoulEventPublisher = (event: Omit<BaseEvent, 'revision'>) => unknown;

export class SoulToolValidationError extends Error {
  readonly issues: unknown[];

  constructor(message: string, issues: unknown[] = []) {
    super(message);
    this.name = 'SoulToolValidationError';
    this.issues = issues;
  }
}

export class UnknownSoulToolError extends Error {
  constructor(toolName: string) {
    super(`Unknown soul tool: ${toolName}`);
    this.name = 'UnknownSoulToolError';
  }
}
