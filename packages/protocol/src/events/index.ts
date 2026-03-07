import { z } from 'zod';
import { EngineOutputEventSchema } from './engine.js';
import { IntegrationEventSchema } from './integration.js';
import { MemoryOperationEventSchema } from './memory.js';
import { RunLifecycleEventSchema } from './run.js';
import { SystemHealthEventSchema } from './system.js';
import { ToolExecutionEventSchema } from './tool.js';

export * from './base.js';
export * from './run.js';
export * from './tool.js';
export * from './engine.js';
export * from './memory.js';
export * from './system.js';
export * from './integration.js';

export const AnyEventSchema = z.union([
  RunLifecycleEventSchema,
  ToolExecutionEventSchema,
  EngineOutputEventSchema,
  MemoryOperationEventSchema,
  SystemHealthEventSchema,
  IntegrationEventSchema,
]);

export type AnyEvent = z.infer<typeof AnyEventSchema>;
