import type { EventObject } from 'xstate';

export interface ApprovalItem {
  approvalId: string;
  runId: string;
  toolName: string;
  args: Record<string, unknown>;
  requestedAt: string;
}

export interface ApprovalContext {
  queue: ApprovalItem[];
  activeItem?: ApprovalItem;
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
