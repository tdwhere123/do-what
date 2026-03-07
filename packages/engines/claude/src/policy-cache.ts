import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HookPolicyCacheSchema,
  type PolicyConfig,
  type PolicyRule,
} from '@do-what/protocol';

type PolicyResult = 'allow' | 'ask' | 'deny';

const DEFAULT_CACHE_FILENAME = 'hook-policy-cache.json';

function escapeRegExp(input: string): string {
  return input.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/');
}

function globToRegExp(pattern: string): RegExp {
  const doubleStarToken = '__DOUBLE_STAR__';
  const singleStarToken = '__SINGLE_STAR__';
  const normalized = normalizePath(pattern);
  const tokenized = normalized
    .replace(/\*\*/g, doubleStarToken)
    .replace(/\*/g, singleStarToken);
  const escaped = escapeRegExp(tokenized)
    .replace(new RegExp(doubleStarToken, 'g'), '::DOUBLE::')
    .replace(new RegExp(singleStarToken, 'g'), '::SINGLE::')
    .replace(/::DOUBLE::/g, '.*');
  return new RegExp(`^${escaped.replace(/::SINGLE::/g, '[^/]*')}$`, 'i');
}

function matchPath(patterns: readonly string[] | undefined, targetPath: string): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  const normalizedTarget = normalizePath(targetPath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalizedTarget));
}

function matchCommand(
  allowCommands: readonly string[] | undefined,
  command: string,
): boolean {
  if (!allowCommands || allowCommands.length === 0) {
    return false;
  }

  const normalizedCommand = command.trim();
  return allowCommands.some((candidate) => {
    const normalizedCandidate = candidate.trim();
    return (
      normalizedCandidate.length > 0
      && (
        normalizedCommand === normalizedCandidate
        || normalizedCommand.startsWith(`${normalizedCandidate} `)
      )
    );
  });
}

function matchDomain(
  allowDomains: readonly string[] | undefined,
  url: string,
): boolean {
  if (!allowDomains || allowDomains.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  });
}

function replaceWorkspaceToken(pattern: string, workspaceRoot: string): string {
  return pattern.replace(/<workspace>/g, normalizePath(workspaceRoot));
}

function extractPathArg(args: Readonly<Record<string, unknown>>): string | undefined {
  const value = args.path ?? args.filePath ?? args.targetPath;
  return typeof value === 'string' ? value : undefined;
}

function extractCommandArg(args: Readonly<Record<string, unknown>>): string | undefined {
  return typeof args.command === 'string' ? args.command : undefined;
}

function extractUrlArg(args: Readonly<Record<string, unknown>>): string | undefined {
  return typeof args.url === 'string' ? args.url : undefined;
}

function cloneRules(rules: PolicyConfig): PolicyConfig {
  return JSON.parse(JSON.stringify(rules)) as PolicyConfig;
}

export interface HookPolicyCacheOptions {
  cachePath?: string;
  watch?: boolean;
  workspaceRoot?: string;
}

export function getDefaultHookPolicyCachePath(): string {
  return path.join(os.homedir(), '.do-what', 'run', DEFAULT_CACHE_FILENAME);
}

export class HookPolicyCache {
  private readonly cachePath: string;
  private readonly workspaceRoot?: string;
  private rules: PolicyConfig = {};
  private watchHandle?: fs.FSWatcher;

  constructor(options: HookPolicyCacheOptions = {}) {
    this.cachePath = options.cachePath ?? getDefaultHookPolicyCachePath();
    this.workspaceRoot = options.workspaceRoot;

    if (options.watch !== false) {
      this.startWatch();
    }
  }

  evaluate(
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    workspaceRoot = this.workspaceRoot,
  ): PolicyResult {
    const rule: PolicyRule = this.rules[toolName] ?? { default: 'ask' };

    if (toolName === 'tools.file_read' || toolName === 'tools.file_write' || toolName === 'tools.file_patch') {
      const targetPath = extractPathArg(args);
      if (targetPath && workspaceRoot) {
        const denyPatterns = rule.deny_paths?.map((pattern) =>
          replaceWorkspaceToken(pattern, workspaceRoot),
        );
        if (matchPath(denyPatterns, targetPath)) {
          return 'deny';
        }

        const allowPatterns = rule.allow_paths?.map((pattern) =>
          replaceWorkspaceToken(pattern, workspaceRoot),
        );
        if (allowPatterns && allowPatterns.length > 0) {
          return matchPath(allowPatterns, targetPath) ? 'allow' : 'ask';
        }
      }
    }

    if (toolName === 'tools.shell_exec') {
      const command = extractCommandArg(args);
      if (command && rule.allow_commands && rule.allow_commands.length > 0) {
        return matchCommand(rule.allow_commands, command) ? 'allow' : 'ask';
      }
    }

    if (toolName === 'tools.web_fetch') {
      const url = extractUrlArg(args);
      if (url && rule.allow_domains && rule.allow_domains.length > 0) {
        return matchDomain(rule.allow_domains, url) ? 'allow' : 'ask';
      }
    }

    return rule.default;
  }

  getRules(): PolicyConfig {
    return cloneRules(this.rules);
  }

  load(): PolicyConfig {
    try {
      const raw = fs.readFileSync(this.cachePath, 'utf8');
      const parsed = HookPolicyCacheSchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) {
        console.warn('[claude][policy-cache] invalid hook policy cache, fallback to ask');
        this.rules = {};
        return this.getRules();
      }

      this.rules = parsed.data.rules;
      return this.getRules();
    } catch (error) {
      console.warn('[claude][policy-cache] failed to load hook policy cache, fallback to ask', error);
      this.rules = {};
      return this.getRules();
    }
  }

  reload(): PolicyConfig {
    return this.load();
  }

  stop(): void {
    if (this.watchHandle) {
      this.watchHandle.close();
      this.watchHandle = undefined;
    }
  }

  private startWatch(): void {
    const watchDir = path.dirname(this.cachePath);
    const watchedFile = path.basename(this.cachePath);
    fs.mkdirSync(watchDir, { recursive: true });

    try {
      this.watchHandle = fs.watch(watchDir, (_eventType, filename) => {
        if (!filename || filename.toString() === watchedFile) {
          this.safeReload();
        }
      });
    } catch (error) {
      console.warn('[claude][policy-cache] failed to watch hook policy cache', error);
      this.watchHandle = undefined;
    }
  }

  private safeReload(): void {
    try {
      this.reload();
    } catch (error) {
      console.warn('[claude][policy-cache] reload failed', error);
    }
  }
}
