import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SoulOpenPointerInput } from '@do-what/protocol';
import { estimateTokens } from '../search/budget-calculator.js';
import { parsePointer, type PointerComponents } from '../pointer/pointer-parser.js';
import { extractSymbolRange } from './symbol-extractor.js';

const DEFAULT_EXCERPT_TOKENS = 200;
const DEFAULT_FULL_TOKENS = 800;
const DEFAULT_MAX_LINES = 40;

export interface EvidenceExtractionRequest {
  gist?: string;
  level: SoulOpenPointerInput['level'];
  maxLines?: number;
  maxTokens?: number;
  pointer: string;
  withContext?: boolean;
}

export interface EvidenceExtractionResult {
  components: PointerComponents;
  content?: string;
  contentHash?: string;
  degraded?: boolean;
  effectiveLevel: SoulOpenPointerInput['level'];
  filePath?: string;
  found: boolean;
  gist?: string;
  lineEnd?: number;
  lineStart?: number;
  reason?: string;
  tokensUsed: number;
}

export interface EvidenceExtractorOptions {
  readFile?: (filePath: string) => Promise<string>;
  workspaceRoot: string;
}

function isWithinWorkspaceRoot(workspaceRoot: string, filePath: string): boolean {
  const relative = path.relative(workspaceRoot, filePath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveBudget(level: SoulOpenPointerInput['level'], maxTokens?: number): number {
  if (maxTokens) {
    return maxTokens;
  }
  return level === 'full' ? DEFAULT_FULL_TOKENS : DEFAULT_EXCERPT_TOKENS;
}

function truncateToLines(content: string, maxLines: number): string {
  return content.split(/\r?\n/).slice(0, maxLines).join('\n');
}

function trimToTokenBudget(content: string, maxTokens: number): { degraded: boolean; value: string } {
  let current = content;
  let degraded = false;

  while (estimateTokens(current) > maxTokens && current.length > 0) {
    degraded = true;
    const lines = current.split(/\r?\n/);
    if (lines.length <= 1) {
      current = current.slice(0, Math.max(0, current.length - 32));
      continue;
    }
    current = lines.slice(0, Math.max(1, lines.length - 1)).join('\n');
  }

  return { degraded, value: current };
}

function createContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export class EvidenceExtractor {
  private readonly readFile: (filePath: string) => Promise<string>;
  private readonly workspaceRoot: string;

  constructor(options: EvidenceExtractorOptions) {
    this.readFile = options.readFile ?? ((filePath) => fs.readFile(filePath, 'utf8'));
    this.workspaceRoot = path.resolve(options.workspaceRoot);
  }

  async extract(request: EvidenceExtractionRequest): Promise<EvidenceExtractionResult> {
    const components = parsePointer(request.pointer);
    if (request.level === 'hint') {
      return {
        components,
        effectiveLevel: 'hint',
        found: true,
        gist: request.gist,
        tokensUsed: estimateTokens(`${request.gist ?? ''} ${request.pointer}`.trim()),
      };
    }

    if (!components.repoPath) {
      return {
        components,
        effectiveLevel: 'hint',
        found: false,
        gist: request.gist,
        reason: 'missing_repo_path',
        tokensUsed: 0,
      };
    }

    const resolvedPath = path.resolve(this.workspaceRoot, components.repoPath);
    if (!isWithinWorkspaceRoot(this.workspaceRoot, resolvedPath)) {
      return {
        components,
        effectiveLevel: 'hint',
        found: false,
        gist: request.gist,
        reason: 'path_outside_workspace',
        tokensUsed: 0,
      };
    }

    const content = await this.safeReadFile(resolvedPath);
    if (!content) {
      return {
        components,
        effectiveLevel: 'hint',
        found: false,
        gist: request.gist,
        reason: 'file_not_found',
        tokensUsed: 0,
      };
    }

    if (request.level === 'full') {
      const fullResult = await this.extractFull(content, resolvedPath, request, components);
      if (fullResult.found) {
        return fullResult;
      }
    }

    return this.extractExcerpt(content, resolvedPath, request, components);
  }

  private async extractFull(
    content: string,
    resolvedPath: string,
    request: EvidenceExtractionRequest,
    components: PointerComponents,
  ): Promise<EvidenceExtractionResult> {
    if (!components.symbol) {
      return {
        components,
        effectiveLevel: 'excerpt',
        found: false,
        gist: request.gist,
        reason: 'symbol_not_found',
        tokensUsed: 0,
      };
    }

    const symbolRange = await extractSymbolRange(content, components.symbol);
    if (!symbolRange) {
      return {
        components,
        effectiveLevel: 'excerpt',
        found: false,
        gist: request.gist,
        reason: 'symbol_not_found',
        tokensUsed: 0,
      };
    }

    const maxTokens = resolveBudget('full', request.maxTokens);
    const trimmed = trimToTokenBudget(symbolRange.snippet, maxTokens);
    if (trimmed.degraded) {
      return {
        components,
        degraded: true,
        effectiveLevel: 'excerpt',
        found: false,
        gist: request.gist,
        reason: 'budget_exceeded',
        tokensUsed: 0,
      };
    }

    return {
      components,
      content: symbolRange.snippet,
      contentHash: createContentHash(symbolRange.snippet),
      effectiveLevel: 'full',
      filePath: resolvedPath,
      found: true,
      gist: request.gist,
      lineEnd: symbolRange.endLine,
      lineStart: symbolRange.startLine,
      tokensUsed: estimateTokens(symbolRange.snippet),
    };
  }

  private extractExcerpt(
    content: string,
    resolvedPath: string,
    request: EvidenceExtractionRequest,
    components: PointerComponents,
  ): EvidenceExtractionResult {
    const maxLines = request.maxLines ?? DEFAULT_MAX_LINES;
    const maxTokens = resolveBudget('excerpt', request.maxTokens);
    const baseExcerpt = truncateToLines(content, maxLines);
    const trimmed = trimToTokenBudget(baseExcerpt, maxTokens);
    const degradedToHint = trimmed.value.length === 0;

    if (degradedToHint) {
      return {
        components,
        degraded: true,
        effectiveLevel: 'hint',
        found: true,
        gist: request.gist,
        tokensUsed: estimateTokens(`${request.gist ?? ''} ${request.pointer}`.trim()),
      };
    }

    return {
      components,
      content: trimmed.value,
      contentHash: createContentHash(trimmed.value),
      degraded: trimmed.degraded || request.level === 'full' || undefined,
      effectiveLevel: 'excerpt',
      filePath: resolvedPath,
      found: true,
      gist: request.gist,
      lineEnd: Math.min(maxLines, content.split(/\r?\n/).length),
      lineStart: 1,
      tokensUsed: estimateTokens(trimmed.value),
    };
  }

  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      return await this.readFile(filePath);
    } catch {
      return null;
    }
  }
}
