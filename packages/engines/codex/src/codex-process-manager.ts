import { CodexProcess, type CodexProcessOptions } from './codex-process.js';
import type { JsonlMessage } from './jsonl-reader.js';

export interface CodexProcessManagerOptions extends CodexProcessOptions {}

export class CodexProcessManager {
  private readonly defaults: CodexProcessManagerOptions;
  private readonly processes = new Map<string, CodexProcess>();

  constructor(defaults: CodexProcessManagerOptions = {}) {
    this.defaults = defaults;
  }

  get size(): number {
    return this.processes.size;
  }

  has(runId: string): boolean {
    return this.processes.has(runId);
  }

  kill(runId: string): void {
    this.processes.get(runId)?.stop();
  }

  killAll(): void {
    for (const process of this.processes.values()) {
      process.stop();
    }
  }

  send(runId: string, message: JsonlMessage): void {
    const process = this.processes.get(runId);
    if (!process) {
      throw new Error(`No Codex process for run ${runId}`);
    }

    process.send(message);
  }

  spawn(runId: string, config: CodexProcessManagerOptions = {}): CodexProcess {
    if (this.processes.has(runId)) {
      throw new Error(`Codex process already exists for run ${runId}`);
    }

    const process = new CodexProcess({
      ...this.defaults,
      ...config,
    });

    process.once('exit', () => {
      if (this.processes.get(runId) === process) {
        this.processes.delete(runId);
      }
    });

    this.processes.set(runId, process);
    process.start();
    return process;
  }
}
