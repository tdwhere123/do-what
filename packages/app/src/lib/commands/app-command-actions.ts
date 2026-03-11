import type { CoreApiAdapter } from '../core-http-client';
import { usePendingCommandStore } from '../../stores/pending-command';
import { dispatchCoreCommand } from './command-dispatcher';
import type { CreateRunDraft } from '../../stores/ui';

export interface ApprovalDecisionInput {
  readonly approvalId: string;
  readonly decision: 'allow_once' | 'allow_session' | 'reject';
  readonly runId: string;
}

export interface MemoryGovernanceInput {
  readonly memoryId: string;
  readonly mode: 'edit' | 'pin' | 'supersede';
  readonly payload?: Record<string, unknown>;
  readonly projectOverride?: boolean;
  readonly runId: string;
}

export interface MemoryProposalReviewInput {
  readonly mode: 'accept' | 'hint_only' | 'reject';
  readonly proposalId: string;
  readonly runId: string;
}

export interface DriftResolutionInput {
  readonly actionId: string;
  readonly mode: 'reconcile' | 'rollback';
  readonly runId: string;
}

export interface IntegrationGateDecisionInput {
  readonly decision: 'approve' | 'block';
  readonly gateId: string;
  readonly runId: string;
}

export async function dispatchCreateRun(
  workspaceId: string,
  draft: CreateRunDraft,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  if (!draft.templateId) {
    throw new Error('A template must be selected before creating a run.');
  }

  return dispatchCoreCommand(
    {
      action: 'create-run',
      command: 'run.create',
      entityType: 'run',
      optimisticPayload: {
        participants: draft.participants,
        templateId: draft.templateId,
      },
      payload: {
        participants: draft.participants,
        templateId: draft.templateId,
        templateInputs: draft.templateInputs,
        templateVersion: draft.templateVersion,
      },
      workspaceId,
    },
    coreApi,
  );
}

export async function dispatchRunMessage(
  runId: string,
  workspaceId: string | null,
  body: string,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('Message body cannot be empty.');
  }

  return dispatchCoreCommand(
    {
      action: 'send-message',
      command: 'run.message',
      entityType: 'message',
      optimisticPayload: {
        body: trimmed,
        title: 'You',
      },
      payload: {
        body: trimmed,
      },
      runId,
      workspaceId: workspaceId ?? undefined,
    },
    coreApi,
  );
}

export async function dispatchApprovalDecision(
  input: ApprovalDecisionInput,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  return dispatchCoreCommand(
    {
      action: `approval-${input.decision}`,
      command: 'approval.resolve',
      entityId: input.approvalId,
      entityType: 'approval',
      payload: {
        approvalId: input.approvalId,
        decision: input.decision,
      },
      reconcileTarget: {
        entityId: input.approvalId,
        entityType: 'approval',
        runId: input.runId,
      },
      runId: input.runId,
    },
    coreApi,
  );
}

export async function dispatchSettingsSave(
  changedFields: Record<string, unknown>,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  return dispatchCoreCommand(
    {
      action: 'settings-save',
      command: 'settings.update',
      entityId: 'settings-root',
      entityType: 'settings',
      optimisticPayload: changedFields,
      payload: {
        fields: changedFields,
      },
      reconcileTarget: {
        entityId: 'settings-root',
        entityType: 'settings',
      },
    },
    coreApi,
  );
}

export async function dispatchMemoryProposalReview(
  input: MemoryProposalReviewInput,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  return dispatchCoreCommand(
    {
      action: `memory-proposal-${input.mode}`,
      command: 'memory.proposal.review',
      entityId: input.proposalId,
      entityType: 'memory',
      payload: {
        mode: input.mode,
        proposalId: input.proposalId,
      },
      reconcileTarget: {
        entityId: input.proposalId,
        entityType: 'memory',
        runId: input.runId,
      },
      runId: input.runId,
    },
    coreApi,
  );
}

export async function dispatchMemoryGovernance(
  input: MemoryGovernanceInput,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  return dispatchCoreCommand(
    {
      action: `memory-${input.mode}`,
      command: 'memory.govern',
      entityId: input.memoryId,
      entityType: 'memory',
      payload: {
        memoryId: input.memoryId,
        mode: input.mode,
        projectOverride: input.projectOverride === true,
        ...input.payload,
      },
      reconcileTarget: {
        entityId: input.memoryId,
        entityType: 'memory',
        runId: input.runId,
      },
      runId: input.runId,
    },
    coreApi,
  );
}

export async function dispatchDriftResolution(
  input: DriftResolutionInput,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  return dispatchCoreCommand(
    {
      action: `drift-${input.mode}`,
      command: 'governance.resolve_drift',
      entityId: input.actionId,
      entityType: 'drift',
      payload: {
        actionId: input.actionId,
        mode: input.mode,
      },
      reconcileTarget: {
        entityId: input.actionId,
        entityType: 'drift',
        runId: input.runId,
      },
      runId: input.runId,
    },
    coreApi,
  );
}

export async function dispatchIntegrationGateDecision(
  input: IntegrationGateDecisionInput,
  coreApi: Pick<CoreApiAdapter, 'postCommand'>,
) {
  return dispatchCoreCommand(
    {
      action: `integration-gate-${input.decision}`,
      command: 'governance.decide_integration_gate',
      entityId: input.gateId,
      entityType: 'gate',
      payload: {
        decision: input.decision,
        gateId: input.gateId,
      },
      reconcileTarget: {
        entityId: input.gateId,
        entityType: 'gate',
        runId: input.runId,
      },
      runId: input.runId,
    },
    coreApi,
  );
}

export function dismissPendingCommand(clientCommandId: string): void {
  usePendingCommandStore.getState().markSettled(clientCommandId);
}
