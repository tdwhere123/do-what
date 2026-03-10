import type { TemplateDescriptor } from '@do-what/protocol';
import { parseTemplateDescriptors } from '../../lib/contracts';

export const TEMPLATE_FIXTURES: readonly TemplateDescriptor[] = parseTemplateDescriptors([
  {
    description: 'General coding workflow with a free-form prompt.',
    inputs: [
      {
        defaultValue: '',
        description: 'Primary task or issue to solve.',
        inputId: 'prompt',
        kind: 'textarea',
        label: 'Prompt',
        required: true,
      },
    ],
    templateId: 'default',
    title: 'Default Coding Run',
  },
  {
    description: 'Focused bugfix flow that starts from a failing symptom.',
    inputs: [
      {
        defaultValue: '',
        description: 'Observed bug or failing test.',
        inputId: 'bug_report',
        kind: 'textarea',
        label: 'Bug Report',
        required: true,
      },
      {
        defaultValue: false,
        description: 'Run quick verification after the fix.',
        inputId: 'run_verification',
        kind: 'checkbox',
        label: 'Verify',
      },
    ],
    templateId: 'bugfix',
    title: 'Bugfix',
  },
  {
    description: 'Research-first flow for investigation and notes.',
    inputs: [
      {
        defaultValue: '',
        description: 'Question or area to research.',
        inputId: 'research_goal',
        kind: 'text',
        label: 'Research Goal',
        required: true,
      },
    ],
    templateId: 'research',
    title: 'Research',
  },
]);
