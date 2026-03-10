import type { SettingsSnapshot } from '@do-what/protocol';
import { createEmptySettingsSnapshot } from '../../lib/contracts';

export const DEFAULT_SETTINGS_FIXTURE: SettingsSnapshot = createEmptySettingsSnapshot({
  coreSessionId: 'mock-core-settings',
  revision: 10,
  sections: [
    {
      fields: [
        {
          fieldId: 'engine.default',
          kind: 'select',
          label: 'Default Engine',
          locked: false,
          options: [
            { label: 'Claude', value: 'claude' },
            { label: 'Codex', value: 'codex' },
          ],
          value: 'codex',
        },
      ],
      locked: false,
      sectionId: 'engine',
      title: 'Engine',
    },
  ],
});

export const LEASE_LOCKED_SETTINGS_FIXTURE: SettingsSnapshot =
  createEmptySettingsSnapshot({
    coreSessionId: 'mock-core-settings',
    lease: {
      leaseId: 'lease-locked-1',
      lockedFields: ['policy.autoApprove', 'soul.mode'],
      status: 'active',
    },
    revision: 12,
    sections: [
      {
        fields: [
          {
            description: 'Managed by governance lease',
            fieldId: 'policy.autoApprove',
            kind: 'toggle',
            label: 'Auto Approve Tools',
            locked: true,
            value: false,
          },
        ],
        locked: true,
        sectionId: 'policy',
        title: 'Policy',
      },
    ],
  });
