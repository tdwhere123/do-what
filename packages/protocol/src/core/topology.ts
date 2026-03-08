import { z } from 'zod';

export const TopologyKindSchema = z.enum([
  'linear',
  'parallel_merge',
  'revise_loop',
  'bounded_fan_out',
]);

export const TemplateNodeSchema = z
  .object({
    node_id: z.string().min(1),
    kind: z.string().min(1).default('step'),
    loop_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const TemplateEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(['forward', 'back']).default('forward'),
  })
  .passthrough();

export const TopologyConstraintsSchema = z
  .object({
    max_parallel: z.number().int().positive().default(5),
    max_loop_count: z.number().int().positive().default(3),
    max_fan_out: z.number().int().positive().default(3),
  })
  .passthrough();

export const OrchestrationTemplateSchema = z
  .object({
    template_id: z.string().min(1),
    topology: TopologyKindSchema.optional(),
    topology_hint: TopologyKindSchema.optional(),
    nodes: z.array(TemplateNodeSchema),
    edges: z.array(TemplateEdgeSchema),
    constraints: TopologyConstraintsSchema.default({
      max_fan_out: 3,
      max_loop_count: 3,
      max_parallel: 5,
    }),
  })
  .passthrough();

export const TopologyViolationSchema = z
  .object({
    violation_type: z.enum([
      'free_dag',
      'parallel_limit',
      'loop_limit',
      'fan_out_limit',
      'nested_parallel',
      'multi_merge_point',
    ]),
    node_ids: z.array(z.string().min(1)),
    description: z.string().min(1),
  })
  .passthrough();

export const ValidationResultSchema = z
  .object({
    valid: z.boolean(),
    topology_kind: z.union([TopologyKindSchema, z.literal('invalid')]),
    violations: z.array(TopologyViolationSchema),
  })
  .passthrough();

export type TopologyKind = z.infer<typeof TopologyKindSchema>;
export type TemplateNode = z.infer<typeof TemplateNodeSchema>;
export type TemplateEdge = z.infer<typeof TemplateEdgeSchema>;
export type TopologyConstraints = z.infer<typeof TopologyConstraintsSchema>;
export type OrchestrationTemplate = z.infer<typeof OrchestrationTemplateSchema>;
export type TopologyViolation = z.infer<typeof TopologyViolationSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
