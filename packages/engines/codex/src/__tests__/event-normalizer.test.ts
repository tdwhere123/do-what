import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { EventNormalizer } from '../event-normalizer.js';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../fixtures');

function loadFixture(fileName: string): unknown[] {
  const filePath = path.join(FIXTURE_DIR, fileName);
  return fs
    .readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
}

function getEventKind(event: NonNullable<ReturnType<EventNormalizer['normalize']>>): string {
  if ('type' in event) {
    return String(event.type);
  }

  const status = (event as typeof event & { status?: unknown }).status;
  return typeof status === 'string' ? status : 'unknown';
}

describe('EventNormalizer', () => {
  it('normalizes codex fixture streams into protocol events', () => {
    const fixtures = [
      {
        expected: ['plan_node', 'token_stream', 'completed'],
        fileName: 'scenario-simple.jsonl',
      },
      {
        expected: ['requested', 'completed', 'completed'],
        fileName: 'scenario-approval.jsonl',
      },
      {
        expected: ['token_stream', 'failed'],
        fileName: 'scenario-cancel.jsonl',
      },
    ] as const;

    for (const fixture of fixtures) {
      const normalizer = new EventNormalizer({ runId: 'run-fixture' });
      const events = loadFixture(fixture.fileName)
        .map((item) => normalizer.normalize(item))
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const sequence = events.map((event) => getEventKind(event));
      expect(sequence).toEqual(fixture.expected);
      expect(events.every((event) => event.runId === 'run-fixture')).toBe(true);
    }
  });

  it('returns null and warns on unknown codex messages', () => {
    const normalizer = new EventNormalizer({ runId: 'run-unknown' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = normalizer.normalize({
      foo: 'bar',
      type: 'something_new',
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
