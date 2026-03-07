import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HealingQueue } from '../pointer/healing-queue.js';
import type { PointerRelocationInput } from '../pointer/pointer-relocator.js';

describe('healing queue', () => {
  it('serializes relocation work and tracks stats', async () => {
    const trace: string[] = [];
    const queue = new HealingQueue({
      maxAttemptsPerMinute: 100,
      relocator: {
        async relocate(input: PointerRelocationInput) {
          trace.push(`start:${input.pointer}`);
          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });
          trace.push(`end:${input.pointer}`);
          return input.pointer.includes('ok')
            ? { found: true, relocationStatus: 'relocated' as const }
            : { found: false, relocationStatus: 'failed' as const };
        },
      } as never,
    });

    await Promise.all([
      queue.enqueue({ pointer: 'ok-pointer' }),
      queue.enqueue({ pointer: 'bad-pointer' }),
    ]);

    assert.deepEqual(trace, [
      'start:ok-pointer',
      'end:ok-pointer',
      'start:bad-pointer',
      'end:bad-pointer',
    ]);
    assert.deepEqual(queue.stats(), {
      completed: 1,
      failed: 1,
      queued: 0,
    });
  });

  it('applies a rate-limit delay when the queue exceeds the per-minute budget', async () => {
    const waits: number[] = [];
    let now = 0;
    const queue = new HealingQueue({
      maxAttemptsPerMinute: 1,
      now: () => now,
      relocator: {
        async relocate() {
          now += 1;
          return { found: true, relocationStatus: 'relocated' as const };
        },
      } as never,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });

    await queue.enqueue({ pointer: 'first' });
    await queue.enqueue({ pointer: 'second' });

    assert.equal(waits.length, 1);
    assert.equal(waits[0]! > 0, true);
  });
});
