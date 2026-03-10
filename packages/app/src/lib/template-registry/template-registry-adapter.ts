import type { TemplateDescriptor } from '@do-what/protocol';

export interface TemplateRegistryAdapter {
  listTemplates(): Promise<readonly TemplateDescriptor[]>;
}
