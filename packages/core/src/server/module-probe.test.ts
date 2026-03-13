import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProbedModules, probeCliModule } from './module-probe.js';

describe('module probe', () => {
  it('marks installed CLIs as connected and captures versions', () => {
    const module = probeCliModule({
      command: 'codex',
      disabled: false,
      label: 'Codex',
      moduleId: 'codex',
      now: '2026-03-13T00:00:00.000Z',
      runCommand: () => ({
        exitCode: 0,
        stderr: '',
        stdout: 'codex 1.2.3',
      }),
    });

    assert.equal(module.status, 'connected');
    assert.equal(module.phase, 'ready');
    assert.deepEqual(module.meta, { version: '1.2.3' });
  });

  it('classifies missing, auth, probe, and disabled modules honestly', () => {
    const missing = probeCliModule({
      command: 'claude',
      disabled: false,
      label: 'Claude',
      moduleId: 'claude',
      now: '2026-03-13T00:00:00.000Z',
      runCommand: () => ({
        exitCode: 1,
        stderr: "'claude' is not recognized as an internal or external command",
        stdout: '',
      }),
    });
    assert.equal(missing.status, 'not_installed');

    const authFailed = probeCliModule({
      command: 'codex',
      disabled: false,
      label: 'Codex',
      moduleId: 'codex',
      now: '2026-03-13T00:00:00.000Z',
      runCommand: () => ({
        exitCode: 1,
        stderr: 'Unauthorized: please login again',
        stdout: '',
      }),
    });
    assert.equal(authFailed.status, 'auth_failed');

    const disabled = probeCliModule({
      command: 'claude',
      disabled: true,
      label: 'Claude',
      moduleId: 'claude',
      now: '2026-03-13T00:00:00.000Z',
    });
    assert.equal(disabled.status, 'disabled');

    const modules = createProbedModules({
      now: () => '2026-03-13T00:00:00.000Z',
      runCommand: () => ({
        exitCode: 1,
        stderr: 'probe exploded',
        stdout: '',
      }),
      soulReady: false,
    });

    assert.equal(modules.core.status, 'connected');
    assert.equal(modules.engines.claude.status, 'probe_failed');
    assert.equal(modules.engines.codex.status, 'probe_failed');
    assert.equal(modules.soul.status, 'probe_failed');
  });
});
