import type { SettingsSnapshot } from '@do-what/protocol';
import { createEmptySettingsSnapshot } from '../../lib/contracts';

const DEFAULT_SECTIONS: SettingsSnapshot['sections'] = [
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
      {
        fieldId: 'engine.parallelism',
        kind: 'number',
        label: 'Concurrent Worker Limit',
        locked: false,
        value: 3,
      },
    ],
    locked: false,
    sectionId: 'engine',
    title: 'Engines',
  },
  {
    fields: [
      {
        fieldId: 'soul.mode',
        kind: 'select',
        label: 'Soul Mode',
        locked: false,
        options: [
          { label: 'Canon', value: 'canon' },
          { label: 'Working', value: 'working' },
        ],
        value: 'canon',
      },
      {
        fieldId: 'soul.memoryRepo',
        kind: 'path',
        label: 'Memory Repository Path',
        locked: false,
        value: '~/.do-what/memory',
      },
    ],
    locked: false,
    sectionId: 'soul',
    title: 'Soul',
  },
  {
    fields: [
      {
        description: 'Allow low-risk tool commands without prompting.',
        fieldId: 'policy.autoApprove',
        kind: 'toggle',
        label: 'Auto Approve Tools',
        locked: false,
        value: false,
      },
      {
        fieldId: 'policy.guardMode',
        kind: 'select',
        label: 'Guard Mode',
        locked: false,
        options: [
          { label: 'Balanced', value: 'balanced' },
          { label: 'Strict', value: 'strict' },
        ],
        value: 'balanced',
      },
    ],
    locked: false,
    sectionId: 'policy',
    title: 'Policies',
  },
  {
    fields: [
      {
        fieldId: 'environment.coreBaseUrl',
        kind: 'text',
        label: 'Core Base URL',
        locked: true,
        value: 'http://127.0.0.1:3847',
      },
      {
        fieldId: 'environment.worktreeRoot',
        kind: 'path',
        label: 'Worktree Root',
        locked: false,
        value: '~/.do-what/worktrees',
      },
    ],
    locked: false,
    sectionId: 'environment',
    title: 'Environment',
  },
  {
    fields: [
      {
        fieldId: 'appearance.theme',
        kind: 'select',
        label: 'Theme',
        locked: false,
        options: [
          { label: 'Warm Paper', value: 'warm-paper' },
          { label: 'Studio Sand', value: 'studio-sand' },
        ],
        value: 'warm-paper',
      },
      {
        fieldId: 'appearance.motion',
        kind: 'toggle',
        label: 'Motion',
        locked: false,
        value: true,
      },
    ],
    locked: false,
    sectionId: 'appearance',
    title: 'Appearance',
  },
];

export const DEFAULT_SETTINGS_FIXTURE: SettingsSnapshot = createEmptySettingsSnapshot({
  coreSessionId: 'mock-core-settings',
  revision: 10,
  sections: DEFAULT_SECTIONS,
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
    sections: DEFAULT_SECTIONS.map((section) => {
      if (section.sectionId === 'policy') {
        return {
          ...section,
          fields: section.fields.map((field) =>
            field.fieldId === 'policy.autoApprove'
              ? {
                  ...field,
                  description: 'Managed by governance lease',
                  locked: true,
                }
              : field,
          ),
        };
      }

      if (section.sectionId === 'soul') {
        return {
          ...section,
          fields: section.fields.map((field) =>
            field.fieldId === 'soul.mode'
              ? {
                  ...field,
                  description: 'Managed by governance lease',
                  locked: true,
                }
              : field,
          ),
        };
      }

      return section;
    }),
  });
