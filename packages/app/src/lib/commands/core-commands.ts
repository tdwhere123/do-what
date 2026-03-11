import type { CoreCommandRequest } from '@do-what/protocol';

export interface CreateCommandInput {
  readonly clientCommandId?: string;
  readonly command: string;
  readonly payload?: CoreCommandRequest['payload'];
  readonly runId?: string;
  readonly workspaceId?: string;
}

export function createClientCommandId(): string {
  return `client-${crypto.randomUUID()}`;
}

export function createCoreCommandRequest(input: CreateCommandInput): CoreCommandRequest {
  return {
    clientCommandId: input.clientCommandId ?? createClientCommandId(),
    command: input.command,
    payload: input.payload ?? {},
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
  };
}
