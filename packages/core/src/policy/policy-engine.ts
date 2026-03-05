import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_POLICY,
  PolicyConfigSchema,
  type PolicyConfig,
  type PolicyRule,
} from '@do-what/protocol';
import {
  ALLOW_REASONS,
  ASK_REASONS,
  DENY_REASONS,
  type PolicyDecision,
} from './decision.js';
import { writePolicyCache } from './cache-writer.js';
import { matchCommand, matchDomain, matchPathList, normalizePath } from './path-matcher.js';

const WATCH_POLL_INTERVAL_MS = 30_000;

interface ApprovalQueueClient {
  enqueue: (item: {
    approvalId?: string;
    args: Readonly<Record<string, unknown>>;
    requestedAt?: string;
    runId: string;
    toolName: string;
  }) => Promise<{
    approved: boolean;
    reason?: string;
    status: 'approved' | 'denied' | 'timeout';
  }>;
}

export interface PolicyEvaluationContext {
  runId?: string;
  workspaceRoot?: string;
}

export interface PolicyEngineOptions {
  approvalMachine?: ApprovalQueueClient;
  cachePath: string;
  policyPath: string;
  watch?: boolean;
  workspaceRoot: string;
}

function cloneDefaultPolicy(): PolicyConfig {
  return JSON.parse(JSON.stringify(DEFAULT_POLICY)) as PolicyConfig;
}

function normalizeWorkspacePath(workspaceRoot: string): string {
  return normalizePath(workspaceRoot);
}

function replaceWorkspaceToken(pattern: string, workspaceRoot: string): string {
  return pattern.replace(/<workspace>/g, workspaceRoot);
}

function extractPathArg(args: Readonly<Record<string, unknown>>): string | undefined {
  const value = args.path ?? args.filePath ?? args.targetPath;
  return typeof value === 'string' ? value : undefined;
}

function extractCommandArg(args: Readonly<Record<string, unknown>>): string | undefined {
  const value = args.command;
  return typeof value === 'string' ? value : undefined;
}

function extractUrlArg(args: Readonly<Record<string, unknown>>): string | undefined {
  const value = args.url;
  return typeof value === 'string' ? value : undefined;
}

export class PolicyEngine {
  private readonly approvalMachine?: ApprovalQueueClient;
  private readonly cachePath: string;
  private lastMtime = 0;
  private readonly policyPath: string;
  private rules: PolicyConfig = cloneDefaultPolicy();
  private pollHandle?: NodeJS.Timeout;
  private readonly workspaceRoot: string;
  private watchHandle?: fs.FSWatcher;

  constructor(options: PolicyEngineOptions) {
    this.approvalMachine = options.approvalMachine;
    this.cachePath = options.cachePath;
    this.policyPath = options.policyPath;
    this.workspaceRoot = normalizeWorkspacePath(options.workspaceRoot);

    if (options.watch !== false) {
      this.startWatch();
    }
  }

  evaluate(
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    context: PolicyEvaluationContext = {},
  ): PolicyDecision {
    const rule: PolicyRule = this.rules[toolName] ?? { default: 'ask' };
    const workspaceRoot = normalizeWorkspacePath(context.workspaceRoot ?? this.workspaceRoot);

    if (toolName === 'tools.file_read' || toolName === 'tools.file_write' || toolName === 'tools.file_patch') {
      const targetPath = extractPathArg(args);
      if (targetPath) {
        const normalizedTarget = normalizePath(targetPath);
        const denyPatterns = rule.deny_paths?.map((pattern) =>
          replaceWorkspaceToken(pattern, workspaceRoot),
        );
        if (matchPathList(denyPatterns, normalizedTarget)) {
          return { reason: DENY_REASONS.pathDenyList, result: 'deny' };
        }

        const allowPatterns = rule.allow_paths?.map((pattern) =>
          replaceWorkspaceToken(pattern, workspaceRoot),
        );
        if (allowPatterns && allowPatterns.length > 0) {
          if (matchPathList(allowPatterns, normalizedTarget)) {
            return { reason: ALLOW_REASONS.pathAllowList, result: 'allow' };
          }
          return { reason: ASK_REASONS.pathNotAllowListed, result: 'ask' };
        }
      }
    }

    if (toolName === 'tools.shell_exec') {
      const command = extractCommandArg(args);
      if (command && rule.allow_commands && rule.allow_commands.length > 0) {
        if (matchCommand(rule.allow_commands, command)) {
          return { reason: ALLOW_REASONS.commandAllowList, result: 'allow' };
        }
        return { reason: ASK_REASONS.commandNotAllowListed, result: 'ask' };
      }
    }

    if (toolName === 'tools.web_fetch') {
      const url = extractUrlArg(args);
      if (url && rule.allow_domains && rule.allow_domains.length > 0) {
        if (matchDomain(rule.allow_domains, url)) {
          return { reason: ALLOW_REASONS.domainAllowList, result: 'allow' };
        }
        return { reason: ASK_REASONS.domainNotAllowListed, result: 'ask' };
      }
    }

    if (rule.default === 'allow') {
      return { reason: ALLOW_REASONS.defaultAllow, result: 'allow' };
    }
    if (rule.default === 'deny') {
      return { reason: DENY_REASONS.defaultDeny, result: 'deny' };
    }
    return { reason: ASK_REASONS.defaultAsk, result: 'ask' };
  }

  async evaluateOrRequest(
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    context: PolicyEvaluationContext = {},
  ): Promise<PolicyDecision> {
    const decision = this.evaluate(toolName, args, context);
    if (decision.result !== 'ask') {
      return decision;
    }

    if (!this.approvalMachine || !context.runId) {
      return decision;
    }

    const resolution = await this.approvalMachine.enqueue({
      approvalId: randomUUID(),
      args,
      requestedAt: new Date().toISOString(),
      runId: context.runId,
      toolName,
    });

    if (resolution.approved) {
      return {
        reason: ALLOW_REASONS.manualApprove,
        result: 'allow',
      };
    }

    return {
      reason: resolution.reason ?? DENY_REASONS.manualDeny,
      result: 'deny',
    };
  }

  getRules(): PolicyConfig {
    return this.rules;
  }

  load(): PolicyConfig {
    const rules = this.readPolicyFromDisk();
    this.rules = rules;
    writePolicyCache(this.rules, this.cachePath);
    return this.rules;
  }

  reload(): PolicyConfig {
    return this.load();
  }

  stop(): void {
    if (this.watchHandle) {
      this.watchHandle.close();
      this.watchHandle = undefined;
    }
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
  }

  private startWatch(): void {
    const watchDir = path.dirname(this.policyPath);
    fs.mkdirSync(watchDir, { recursive: true });

    try {
      this.watchHandle = fs.watch(this.policyPath, () => {
        this.safeReload();
      });
    } catch {
      this.watchHandle = undefined;
    }

    this.pollHandle = setInterval(() => {
      this.pollForChanges();
    }, WATCH_POLL_INTERVAL_MS);
    this.pollHandle.unref();
  }

  private pollForChanges(): void {
    try {
      const stat = fs.statSync(this.policyPath);
      const mtime = stat.mtimeMs;
      if (mtime > this.lastMtime) {
        this.lastMtime = mtime;
        this.safeReload();
      }
    } catch {
      // Ignore polling errors; next tick will retry.
    }
  }

  private readPolicyFromDisk(): PolicyConfig {
    fs.mkdirSync(path.dirname(this.policyPath), { recursive: true });

    if (!fs.existsSync(this.policyPath)) {
      const defaults = cloneDefaultPolicy();
      fs.writeFileSync(this.policyPath, `${JSON.stringify(defaults, null, 2)}\n`, 'utf8');
      this.lastMtime = fs.statSync(this.policyPath).mtimeMs;
      return defaults;
    }

    try {
      const raw = fs.readFileSync(this.policyPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const result = PolicyConfigSchema.safeParse(parsed);
      if (!result.success) {
        console.warn('[core][policy] invalid policy.json, fallback to defaults');
        return cloneDefaultPolicy();
      }
      this.lastMtime = fs.statSync(this.policyPath).mtimeMs;
      return result.data;
    } catch (error) {
      console.warn('[core][policy] failed to load policy.json, fallback to defaults', error);
      return cloneDefaultPolicy();
    }
  }

  private safeReload(): void {
    try {
      this.reload();
    } catch (error) {
      console.warn('[core][policy] reload failed', error);
    }
  }
}

