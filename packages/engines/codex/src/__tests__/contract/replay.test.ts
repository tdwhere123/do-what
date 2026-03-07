import fs from 'node:fs';
import path from 'node:path';
import {
  EngineOutputEventSchema,
  RunLifecycleEventSchema,
  ToolExecutionEventSchema,
  type BaseEvent,
} from '@do-what/protocol';
import { describe, expect, it } from 'vitest';

import { EventNormalizer } from '../../event-normalizer.js';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../fixtures');

function loadScenario(fileName: string): unknown[] {
  const filePath = path.join(FIXTURE_DIR, fileName);
  return fs
    .readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
}

function parseProtocolEvent(event: BaseEvent): boolean {
  if ('type' in event) {
    return EngineOutputEventSchema.safeParse(event).success;
  }

  return (
    RunLifecycleEventSchema.safeParse(event).success ||
    ToolExecutionEventSchema.safeParse(event).success
  );
}

function getEventKind(event: BaseEvent): string {
  if ('type' in event) {
    return String(event.type);
  }

  const status = (event as BaseEvent & { status?: unknown }).status;
  return typeof status === 'string' ? status : 'unknown';
}

describe('codex contract replay', () => {
  it('replays all codex fixtures through the normalizer and validates protocol schemas', () => {
    const scenarios = [
      {
        fileName: 'scenario-simple.jsonl',
        sequence: ['plan_node', 'token_stream', 'completed'],
      },
      {
        fileName: 'scenario-approval.jsonl',
        sequence: ['requested', 'completed', 'completed'],
      },
      {
        fileName: 'scenario-cancel.jsonl',
        sequence: ['token_stream', 'failed'],
      },
    ] as const;

    for (const scenario of scenarios) {
      const normalizer = new EventNormalizer({ runId: `run-${scenario.fileName}` });
      const events = loadScenario(scenario.fileName)
        .map((item) => normalizer.normalize(item))
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const sequence = events.map((event) => getEventKind(event));
      expect(sequence).toEqual(scenario.sequence);
      expect(events.every((event) => parseProtocolEvent(event))).toBe(true);

      // revision is set to 0 by the normalizer as a placeholder.
      // Core assigns monotonically increasing revisions when events enter the EventBus.
      // Here we verify the field exists and is a non-negative number.
      const revisions = events.map((event) => event.revision);
      expect(revisions.every((r) => typeof r === 'number' && r >= 0)).toBe(true);
    }
  });
});
