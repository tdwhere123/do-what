import fs from 'node:fs/promises';
import path from 'node:path';

import {
  validateClaudeHooks,
  type ClaudeValidationResult,
  type ValidationCheck as ClaudeCheck,
} from './validate-claude-hooks.ts';
import {
  validateCodexAppServer,
  type CodexValidationResult,
  type ValidationCheck as CodexCheck,
} from './validate-codex-appserver.ts';

type ValidationStatus = 'pass' | 'warn' | 'fail';

interface ValidationCheck {
  id: string;
  title: string;
  status: ValidationStatus;
  details: string;
  data?: Record<string, unknown>;
}

interface MockRerouteResult {
  checks: ValidationCheck[];
  failedCases: Array<{ toolName: string; reason: string }>;
  successCount: number;
  successRate: number;
  total: number;
}

function statusLabel(status: ValidationStatus): string {
  if (status === 'pass') {
    return '✅';
  }
  if (status === 'warn') {
    return '⚠️';
  }
  return '❌';
}

function normalizeCheck(
  check: ClaudeCheck | CodexCheck,
  prefix: string,
): ValidationCheck {
  return {
    data: check.data,
    details: check.details,
    id: `${prefix}:${check.id}`,
    status: check.status,
    title: check.title,
  };
}

function runDenyRerouteMock(): MockRerouteResult {
  const deniedRequests = [
    { reason: 'policy_denied', toolName: 'shell_exec' },
    { reason: 'policy_denied', toolName: 'file_write' },
    { reason: 'policy_denied', toolName: 'web_fetch' },
    { reason: 'policy_denied', toolName: 'docker_exec' },
    { reason: 'policy_denied', toolName: 'unknown_internal_tool' },
    { reason: 'policy_denied', toolName: 'shell_exec' },
    { reason: 'policy_denied', toolName: 'file_write' },
    { reason: 'policy_denied', toolName: 'web_fetch' },
    { reason: 'policy_denied', toolName: 'docker_exec' },
    { reason: 'policy_denied', toolName: 'shell_exec' },
    { reason: 'policy_denied', toolName: 'file_write' },
    { reason: 'policy_denied', toolName: 'web_fetch' },
    { reason: 'policy_denied', toolName: 'docker_exec' },
    { reason: 'policy_denied', toolName: 'shell_exec' },
    { reason: 'policy_denied', toolName: 'file_write' },
    { reason: 'policy_denied', toolName: 'web_fetch' },
    { reason: 'policy_denied', toolName: 'docker_exec' },
    { reason: 'policy_denied', toolName: 'shell_exec' },
    { reason: 'policy_denied', toolName: 'file_write' },
    { reason: 'policy_denied', toolName: 'web_fetch' },
  ] as const;

  const rerouteMap = new Map<string, string>([
    ['docker_exec', 'mcp.container.exec'],
    ['file_write', 'mcp.filesystem.write'],
    ['shell_exec', 'mcp.shell.exec'],
    ['web_fetch', 'mcp.web.fetch'],
  ]);

  const failedCases: Array<{ reason: string; toolName: string }> = [];
  let successCount = 0;
  for (const request of deniedRequests) {
    const rerouted = rerouteMap.get(request.toolName);
    if (rerouted) {
      successCount += 1;
    } else {
      failedCases.push({ reason: request.reason, toolName: request.toolName });
    }
  }

  const total = deniedRequests.length;
  const successRate = total === 0 ? 0 : successCount / total;
  const status: ValidationStatus =
    successRate >= 0.95 ? 'pass' : successRate >= 0.8 ? 'warn' : 'fail';

  return {
    checks: [
      {
        details: `mock reroute success ${successCount}/${total} (${(
          successRate * 100
        ).toFixed(1)}%)`,
        id: 'deny_reroute_mcp',
        status,
        title: 'deny -> reroute MCP success rate (mock)',
      },
    ],
    failedCases,
    successCount,
    successRate,
    total,
  };
}

function findDiffHints(
  claude: ClaudeValidationResult,
  codex: CodexValidationResult,
): string[] {
  const diffs: string[] = [];
  if (claude.usedSyntheticEvents) {
    diffs.push('Claude hook events currently sampled from synthetic payloads (runtime hook capture unavailable).');
  }
  if (!claude.passthroughOk) {
    diffs.push('Protocol passthrough failed for at least one hook event sample.');
  }
  if (!claude.coreSseConnected) {
    diffs.push('Core SSE e2e probe did not observe forwarded hook events.');
  }
  if (!codex.runtimeProbeSucceeded && codex.schemaFallbackUsed) {
    diffs.push('Codex event coverage inferred from generated app-server schema, not runtime stream.');
  }
  if (!codex.runtimeProbeSucceeded && !codex.schemaFallbackUsed) {
    diffs.push('Codex runtime probe and schema fallback both failed.');
  }
  if (diffs.length === 0) {
    diffs.push('No protocol shape diff detected in current validation scope.');
  }
  return diffs;
}

function buildReport(
  allChecks: ValidationCheck[],
  claude: ClaudeValidationResult,
  codex: CodexValidationResult,
  reroute: MockRerouteResult,
): string {
  const now = new Date().toISOString();
  const diffHints = findDiffHints(claude, codex);
  const failCount = allChecks.filter((check) => check.status === 'fail').length;
  const warnCount = allChecks.filter((check) => check.status === 'warn').length;

  const checkRows = allChecks
    .map(
      (check) =>
        `| ${statusLabel(check.status)} | ${check.title} | ${check.details.replace(/\|/g, '\\|')} |`,
    )
    .join('\n');

  const diffRows = diffHints.map((hint) => `- ${hint}`).join('\n');

  const claudeCmdRows = claude.commandResults
    .map(
      (item) =>
        `- \`${item.command} ${item.args.join(' ')}\` -> ok=${item.ok}, exit=${String(
          item.exitCode,
        )}, duration=${item.durationMs}ms`,
    )
    .join('\n');

  const codexCmdRows = codex.commandResults
    .map(
      (item) =>
        `- \`${item.command} ${item.args.join(' ')}\` -> ok=${item.ok}, exit=${String(
          item.exitCode,
        )}, duration=${item.durationMs}ms`,
    )
    .join('\n');

  return `# Protocol Validation Report (T010)

- Generated at: ${now}
- Workspace: \`${process.cwd()}\`
- Status summary: ${allChecks.length - failCount - warnCount} pass / ${warnCount} warn / ${failCount} fail

## Key Checks

| Status | Checkpoint | Details |
| --- | --- | --- |
${checkRows}

## Compatibility Metrics

- Hook schema parse success rate: ${(claude.parseSuccessRate * 100).toFixed(1)}% (${claude.parseSuccessCount}/${claude.parseTotal})
- Hook passthrough validation: ${claude.passthroughOk ? 'pass' : 'not fully verified'}
- Hook latency sample: ${claude.hookLatencyMs === null ? 'N/A' : `${claude.hookLatencyMs}ms`}
- Codex coverage snapshot:
  - token_stream: ${codex.coverage.token_stream}
  - plan_node: ${codex.coverage.plan_node}
  - diff: ${codex.coverage.diff}
  - approval_request: ${codex.coverage.approval_request}
- deny -> reroute MCP mock success rate: ${(reroute.successRate * 100).toFixed(1)}% (${reroute.successCount}/${reroute.total})

## Observed Protocol Differences

${diffRows}

## Command Probe Log

### Claude

${claudeCmdRows || '- no command probe executed'}

### Codex

${codexCmdRows || '- no command probe executed'}

## Raw Sample Events

### Hook Event Sample (normalized)

\`\`\`json
${JSON.stringify(claude.normalizedEvents.slice(0, 3), null, 2)}
\`\`\`

### Codex Methods (first 30)

\`\`\`json
${JSON.stringify(codex.observedMethods.slice(0, 30), null, 2)}
\`\`\`

## Follow-ups

- If any row is marked ❌, create a follow-up ticket before starting E2/E3.
- If rows are ⚠️ due environment restrictions, rerun on a host with working CLI spawn/auth and refresh this report.
- If hook parse success drops below 95% on real data, update protocol schema/adapter mapping in the same PR.
`;
}

function printConsoleSummary(checks: ValidationCheck[]): void {
  for (const check of checks) {
    process.stdout.write(`${statusLabel(check.status)} ${check.title}: ${check.details}\n`);
  }
}

async function main(): Promise<void> {
  process.stdout.write('[T010] Running Claude hook validation...\n');
  const claude = await validateClaudeHooks();

  process.stdout.write('[T010] Running Codex app-server validation...\n');
  const codex = await validateCodexAppServer();

  process.stdout.write('[T010] Running deny->reroute mock validation...\n');
  const reroute = runDenyRerouteMock();

  const mergedChecks: ValidationCheck[] = [
    ...claude.checks.map((check) => normalizeCheck(check, 'claude')),
    ...codex.checks.map((check) => normalizeCheck(check, 'codex')),
    ...reroute.checks.map((check) => normalizeCheck(check, 'mock')),
  ];

  printConsoleSummary(mergedChecks);

  const report = buildReport(mergedChecks, claude, codex, reroute);
  const reportPath = path.join(process.cwd(), 'docs', 'protocol-validation-report.md');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report, 'utf8');
  process.stdout.write(`[T010] Report written: ${reportPath}\n`);

  const hasFail = mergedChecks.some((check) => check.status === 'fail');
  if (hasFail) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `[validation-runner] ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
