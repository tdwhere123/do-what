import { z } from 'zod';

export const FileSnapshotSchema = z
  .object({
    path: z.string().min(1),
    git_hash: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
  })
  .passthrough();

export const BaselineLockSchema = z
  .object({
    lock_id: z.string().min(1),
    run_id: z.string().min(1),
    surface_id: z.string().min(1),
    workspace_id: z.string().min(1),
    baseline_fingerprint: z.string().min(1),
    locked_at: z.string().datetime(),
    files_snapshot: z.array(FileSnapshotSchema),
  })
  .passthrough();

export type FileSnapshot = z.infer<typeof FileSnapshotSchema>;
export type BaselineLock = z.infer<typeof BaselineLockSchema>;
