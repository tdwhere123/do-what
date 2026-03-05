import type { EventObject } from 'xstate';

export interface ApprovalItem {
  readonly approvalId: string;
  readonly runId: string;
  readonly toolName: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly requestedAt: string;
}

export interface ApprovalContext {
  readonly queue: readonly ApprovalItem[];
  readonly activeItem?: ApprovalItem;
}

export type ApprovalEvent =
  | ({
      type: 'ENQUEUE';
      item: ApprovalItem;
    } & EventObject)
  | ({
      type: 'USER_APPROVE';
      approvalId: string;
      approvedBy?: 'user' | 'policy';
    } & EventObject)
  | ({
      type: 'USER_DENY';
      approvalId: string;
      reason?: string;
    } & EventObject)
  | ({
      type: 'TIMEOUT';
      approvalId: string;
    } & EventObject);
