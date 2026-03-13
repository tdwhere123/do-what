import { z } from 'zod';

export const ModuleKindSchema = z.enum(['core', 'engine', 'soul']);

export const ModuleStatusSchema = z.enum([
  'connected',
  'disconnected',
  'not_installed',
  'probe_failed',
  'auth_failed',
  'disabled',
]);

export const ModulePhaseSchema = z.enum(['probing', 'ready', 'degraded']);

export type ModuleKind = z.infer<typeof ModuleKindSchema>;
export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;
export type ModulePhase = z.infer<typeof ModulePhaseSchema>;
