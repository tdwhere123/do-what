import fs from 'node:fs';
import path from 'node:path';
import { ToolsApiSchemas } from '@do-what/protocol';

const DEFAULT_RELATIVE_PATH = path.join('.dowhat', 'CLAUDE.md');

export function generateClaudeMdContent(): string {
  const tools = Object.keys(ToolsApiSchemas)
    .map((toolName) => `- \`${toolName}\``)
    .join('\n');

  return `# do-what Runtime Rules

You are running inside do-what.

## Hard Requirements
- Do not use native Bash/Write/Edit tools for filesystem, shell, or network operations.
- Use do-what MCP tools instead.
- If a tool requires approval, wait for approval rather than retrying the same denied native tool.

## Available MCP Tools
${tools}
`;
}

export function writeClaudeMdFile(workspaceRoot: string): string {
  const targetPath = path.join(workspaceRoot, DEFAULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${generateClaudeMdContent()}\n`, 'utf8');
  return targetPath;
}
