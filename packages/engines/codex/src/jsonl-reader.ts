import EventEmitter from 'node:events';
import readline from 'node:readline';
import type { Readable } from 'node:stream';

export type JsonlMessage = Readonly<Record<string, unknown>>;

interface JsonlReaderEvents {
  close: [];
  error: [error: Error];
  line: [message: JsonlMessage];
}

function isJsonlMessage(value: unknown): value is JsonlMessage {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function parseLine(rawLine: string): JsonlMessage | null {
  const line = rawLine.trim();
  if (line.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as unknown;
    if (!isJsonlMessage(parsed)) {
      console.warn('[codex][jsonl-reader] ignoring non-object JSONL line');
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('[codex][jsonl-reader] failed to parse JSONL line', {
      error: String(error),
      rawLine,
    });
    return null;
  }
}

export class JsonlReader extends EventEmitter {
  private readonly input: Readable;
  private readonly rl: readline.Interface;

  constructor(input: Readable) {
    super();
    this.input = input;
    this.rl = readline.createInterface({
      crlfDelay: Infinity,
      input,
    });

    this.bindEvents();
  }

  close(): void {
    this.rl.close();
  }

  override on<TEvent extends keyof JsonlReaderEvents>(
    event: TEvent,
    listener: (...args: JsonlReaderEvents[TEvent]) => void,
  ): this {
    return super.on(event, listener);
  }

  override once<TEvent extends keyof JsonlReaderEvents>(
    event: TEvent,
    listener: (...args: JsonlReaderEvents[TEvent]) => void,
  ): this {
    return super.once(event, listener);
  }

  private bindEvents(): void {
    this.rl.on('line', (rawLine) => {
      const parsed = parseLine(rawLine);
      if (parsed) {
        this.emit('line', parsed);
      }
    });

    this.rl.once('close', () => {
      this.emit('close');
    });

    this.input.on('error', (error) => {
      this.emit('error', toError(error));
    });
  }
}
