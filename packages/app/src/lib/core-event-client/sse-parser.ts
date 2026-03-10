export interface SseFrame {
  readonly data: string;
}

function parseFrame(block: string): SseFrame | null {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return {
    data: dataLines.join('\n'),
  };
}

export function extractSseFrames(buffer: string): {
  readonly frames: readonly SseFrame[];
  readonly remainder: string;
} {
  const chunks = buffer.split(/\r?\n\r?\n/);
  const remainder = chunks.pop() ?? '';
  const frames = chunks.flatMap((chunk) => {
    const parsed = parseFrame(chunk);
    return parsed ? [parsed] : [];
  });

  return {
    frames,
    remainder,
  };
}

export async function readSseStream(
  stream: ReadableStream<Uint8Array> | null,
  onFrame: (frame: SseFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = extractSseFrames(buffer);
      buffer = remainder;
      frames.forEach(onFrame);
    }

    buffer += decoder.decode();
    const { frames } = extractSseFrames(`${buffer}\n\n`);
    frames.forEach(onFrame);
  } finally {
    reader.releaseLock();
  }
}
