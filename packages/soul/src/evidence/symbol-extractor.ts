export interface SymbolLocation {
  endLine: number;
  snippet: string;
  startLine: number;
}

const DECLARATION_PATTERNS = [
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/,
  /(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>/,
  /class\s+([A-Za-z_]\w*)/,
  /interface\s+([A-Za-z_]\w*)/,
  /type\s+([A-Za-z_]\w*)\s*=/,
  /def\s+([A-Za-z_]\w*)/,
  /func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/,
];

function getTargetName(symbol: string): string {
  const parts = symbol.split(/[.#]/).filter(Boolean);
  return parts[parts.length - 1] ?? symbol;
}

function countBraceDelta(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === '{') {
      delta += 1;
    } else if (char === '}') {
      delta -= 1;
    }
  }
  return delta;
}

function isDeclarationLine(line: string): boolean {
  return DECLARATION_PATTERNS.some((pattern) => pattern.test(line));
}

function findDeclarationLine(lines: readonly string[], targetName: string): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    for (const pattern of DECLARATION_PATTERNS) {
      const match = line.match(pattern);
      if (match?.[1] === targetName) {
        return index;
      }
    }
  }

  return -1;
}

function findBlockEnd(lines: readonly string[], startIndex: number): number {
  let braceBalance = 0;
  let sawBraces = false;
  const startIndent = (lines[startIndex] ?? '').match(/^\s*/)![0].length;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    braceBalance += countBraceDelta(line);
    sawBraces = sawBraces || line.includes('{');

    if (sawBraces && index > startIndex && braceBalance <= 0 && trimmed.endsWith('}')) {
      return index;
    }

    if (!sawBraces && index > startIndex) {
      if (trimmed.length === 0) {
        continue;
      }

      const indent = line.match(/^\s*/)![0].length;
      if (indent <= startIndent && isDeclarationLine(line)) {
        return index - 1;
      }
    }
  }

  return lines.length - 1;
}

export async function extractSymbolRange(
  content: string,
  symbol: string,
): Promise<SymbolLocation | null> {
  try {
    const moduleName = 'tree-sitter';
    await import(moduleName);
  } catch {
    // Tree-sitter is optional. The regex fallback still covers the supported flow.
  }

  const lines = content.split(/\r?\n/);
  const declarationLine = findDeclarationLine(lines, getTargetName(symbol));
  if (declarationLine < 0) {
    return null;
  }

  const endLine = findBlockEnd(lines, declarationLine);
  return {
    endLine: endLine + 1,
    snippet: lines.slice(declarationLine, endLine + 1).join('\n'),
    startLine: declarationLine + 1,
  };
}
