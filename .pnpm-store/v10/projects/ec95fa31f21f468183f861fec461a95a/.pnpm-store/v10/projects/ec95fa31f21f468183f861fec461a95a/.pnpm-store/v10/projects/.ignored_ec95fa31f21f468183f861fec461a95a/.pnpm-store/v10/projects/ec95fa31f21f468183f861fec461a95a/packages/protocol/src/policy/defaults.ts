import type { PolicyConfig } from './config.js';

export const DEFAULT_POLICY: PolicyConfig = {
  'tools.file_read': {
    default: 'allow',
  },
  'tools.file_write': {
    default: 'ask',
  },
  'tools.file_patch': {
    default: 'ask',
  },
  'tools.shell_exec': {
    default: 'ask',
  },
  'tools.git_apply': {
    default: 'ask',
  },
  'tools.git_status': {
    default: 'allow',
  },
  'tools.git_diff': {
    default: 'allow',
  },
  'tools.web_fetch': {
    default: 'ask',
  },
  'tools.docker_run': {
    default: 'ask',
  },
  'tools.wsl_exec': {
    default: 'ask',
  },
};
