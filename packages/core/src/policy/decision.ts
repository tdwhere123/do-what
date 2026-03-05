export type PolicyResult = 'allow' | 'ask' | 'deny';

export interface PolicyDecision {
  reason: string;
  result: PolicyResult;
}

export const ALLOW_REASONS = {
  commandAllowList: 'allowed by command allowlist',
  defaultAllow: 'allowed by default policy',
  domainAllowList: 'allowed by domain allowlist',
  manualApprove: 'approved by user/policy',
  pathAllowList: 'allowed by path allowlist',
} as const;

export const ASK_REASONS = {
  commandNotAllowListed: 'command not in allowlist, requires approval',
  defaultAsk: 'policy requires user approval',
  domainNotAllowListed: 'domain not in allowlist, requires approval',
  pathNotAllowListed: 'path not in allowlist, requires approval',
} as const;

export const DENY_REASONS = {
  defaultDeny: 'denied by default policy',
  manualDeny: 'denied by user/policy',
  pathDenyList: 'denied by path denylist',
} as const;

