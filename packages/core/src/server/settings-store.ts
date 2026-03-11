import type { SettingsSnapshot } from '@do-what/protocol';
import { SettingsSnapshotSchema } from '@do-what/protocol';

type SettingsSection = SettingsSnapshot['sections'][number];
type SettingsLease = SettingsSnapshot['lease'];

function createInitialSections(workspaceRoot: string): SettingsSnapshot['sections'] {
  return [
    {
      fields: [
        {
          description: 'Preferred execution mode for interactive runs.',
          fieldId: 'engine.connection_mode',
          kind: 'select',
          locked: false,
          options: [
            { label: 'Loopback', value: 'loopback' },
            { label: 'Socket', value: 'socket' },
          ],
          value: 'loopback',
        },
        {
          description: 'Run lightweight health probes before dispatch.',
          fieldId: 'engine.health_probe',
          kind: 'toggle',
          locked: false,
          value: true,
        },
      ],
      locked: false,
      sectionId: 'engine',
      title: 'Engines',
    },
    {
      fields: [
        {
          description: 'Soul provider mode used for recall and review.',
          fieldId: 'soul.provider_mode',
          kind: 'select',
          locked: false,
          options: [
            { label: 'Basic', value: 'basic' },
            { label: 'Enhanced', value: 'enhanced' },
          ],
          value: 'basic',
        },
        {
          description: 'Daily token budget for Soul assists.',
          fieldId: 'soul.daily_budget_tokens',
          kind: 'number',
          locked: false,
          value: 600,
        },
      ],
      locked: false,
      sectionId: 'soul',
      title: 'Soul',
    },
    {
      fields: [
        {
          description: 'Default approval posture for risky actions.',
          fieldId: 'policy.default_decision',
          kind: 'select',
          locked: false,
          options: [
            { label: 'Ask', value: 'ask' },
            { label: 'Allow', value: 'allow' },
            { label: 'Deny', value: 'deny' },
          ],
          value: 'ask',
        },
      ],
      locked: false,
      sectionId: 'policy',
      title: 'Policies',
    },
    {
      fields: [
        {
          description: 'Primary workspace root used by Core.',
          fieldId: 'environment.workspace_root',
          kind: 'path',
          locked: false,
          value: workspaceRoot,
        },
      ],
      locked: false,
      sectionId: 'environment',
      title: 'Environment',
    },
    {
      fields: [
        {
          description: 'UI theme preference surfaced to the renderer.',
          fieldId: 'appearance.theme',
          kind: 'select',
          locked: false,
          options: [
            { label: 'System', value: 'system' },
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ],
          value: 'system',
        },
      ],
      locked: false,
      sectionId: 'appearance',
      title: 'Appearance',
    },
  ];
}

function applyFieldUpdates(
  sections: readonly SettingsSection[],
  fields: Readonly<Record<string, unknown>>,
): SettingsSnapshot['sections'] {
  return sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) =>
      Object.prototype.hasOwnProperty.call(fields, field.fieldId)
        ? {
            ...field,
            value: fields[field.fieldId],
          }
        : field,
    ),
  }));
}

function applyLeaseLocks(
  sections: readonly SettingsSection[],
  lease: SettingsLease,
): SettingsSnapshot['sections'] {
  const lockedFieldSet = new Set(lease.lockedFields);
  return sections.map((section) => {
    const fields = section.fields.map((field) => ({
      ...field,
      locked: section.locked || lockedFieldSet.has(field.fieldId),
    }));
    return {
      ...section,
      fields,
      locked: lease.status === 'active' && fields.some((field) => field.locked),
    };
  });
}

export class SettingsStore {
  private revision = 0;
  private sections: SettingsSnapshot['sections'];

  constructor(workspaceRoot: string) {
    this.sections = createInitialSections(workspaceRoot);
  }

  snapshot(input: {
    coreSessionId: string | null;
    lease: SettingsLease;
    revision: number;
  }): SettingsSnapshot {
    return SettingsSnapshotSchema.parse({
      coreSessionId: input.coreSessionId,
      lease: input.lease,
      revision: Math.max(this.revision, input.revision),
      sections: applyLeaseLocks(this.sections, input.lease),
    });
  }

  updateFields(fields: Readonly<Record<string, unknown>>, revision: number): SettingsSnapshot['sections'] {
    this.sections = applyFieldUpdates(this.sections, fields);
    this.revision = Math.max(this.revision, revision);
    return this.sections;
  }
}
