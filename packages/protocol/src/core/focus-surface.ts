import { z } from 'zod';

export const ArtifactKindSchema = z.enum([
  'source_file',
  'test_file',
  'schema_type',
  'migration',
  'config',
]);

export const CoreFocusSurfaceSchema = z
  .object({
    surface_id: z.string().min(1),
    workspace_id: z.string().min(1),
    package_scope: z.array(z.string().min(1)).default([]),
    path_globs: z.array(z.string().min(1)).default([]),
    artifact_kind: z.array(ArtifactKindSchema).default([]),
    baseline_fingerprint: z.string().min(1),
    created_at: z.string().datetime(),
  })
  .passthrough();

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type FocusSurface = z.infer<typeof CoreFocusSurfaceSchema>;
