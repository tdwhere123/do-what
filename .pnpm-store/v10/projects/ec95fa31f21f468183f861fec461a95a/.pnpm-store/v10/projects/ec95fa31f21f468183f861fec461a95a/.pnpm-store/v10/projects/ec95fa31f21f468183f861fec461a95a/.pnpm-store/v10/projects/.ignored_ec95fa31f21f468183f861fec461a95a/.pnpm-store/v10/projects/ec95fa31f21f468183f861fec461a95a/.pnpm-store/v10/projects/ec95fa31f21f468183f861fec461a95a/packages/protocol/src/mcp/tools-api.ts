import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const LineRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const PatchSchema = z.object({
  type: z.enum(['replace', 'insert', 'delete']),
  lineStart: z.number().int().nonnegative(),
  lineEnd: z.number().int().nonnegative().optional(),
  content: z.string().optional(),
});

const FileReadInputSchema = z.object({
  path: z.string(),
  encoding: z.string().optional(),
  line_range: LineRangeSchema.optional(),
});

const FileWriteInputSchema = z.object({
  path: z.string(),
  content: z.string(),
  create_dirs: z.boolean().optional(),
});

const FilePatchInputSchema = z.object({
  path: z.string(),
  patches: z.array(PatchSchema),
});

const ShellExecInputSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeout: z.number().int().positive().optional(),
  sandbox: z.enum(['native', 'wsl', 'docker']).default('native'),
});

const GitApplyInputSchema = z.object({
  patch: z.string(),
  worktree_id: z.string().optional(),
  message: z.string().optional(),
});

const GitStatusInputSchema = z.object({
  worktree_id: z.string().optional(),
});

const GitDiffInputSchema = z.object({
  ref_a: z.string().optional(),
  ref_b: z.string().optional(),
  paths: z.array(z.string()).optional(),
});

const WebFetchInputSchema = z.object({
  url: z.string(),
  method: z.string().optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
});

const DockerRunInputSchema = z.object({
  image: z.string(),
  command: z.string(),
  mounts: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const WslExecInputSchema = z.object({
  command: z.string(),
  distro: z.string().optional(),
});

export const ToolsApiSchemas = {
  'tools.file_read': FileReadInputSchema,
  'tools.file_write': FileWriteInputSchema,
  'tools.file_patch': FilePatchInputSchema,
  'tools.shell_exec': ShellExecInputSchema,
  'tools.git_apply': GitApplyInputSchema,
  'tools.git_status': GitStatusInputSchema,
  'tools.git_diff': GitDiffInputSchema,
  'tools.web_fetch': WebFetchInputSchema,
  'tools.docker_run': DockerRunInputSchema,
  'tools.wsl_exec': WslExecInputSchema,
} as const;

export type ToolsApiName = keyof typeof ToolsApiSchemas;

const toJsonSchema = (schema: z.ZodTypeAny) =>
  zodToJsonSchema(schema, {
    $refStrategy: 'none',
  });

const toolSchemaEntries = Object.entries(ToolsApiSchemas) as [ToolsApiName, z.ZodTypeAny][];

export const ToolsApiJsonSchemas = Object.fromEntries(
  toolSchemaEntries.map(([toolName, schema]) => [toolName, toJsonSchema(schema)]),
) as Record<ToolsApiName, ReturnType<typeof toJsonSchema>>;

export type FileReadInput = z.infer<typeof FileReadInputSchema>;
export type FileWriteInput = z.infer<typeof FileWriteInputSchema>;
export type FilePatchInput = z.infer<typeof FilePatchInputSchema>;
export type ShellExecInput = z.infer<typeof ShellExecInputSchema>;
export type GitApplyInput = z.infer<typeof GitApplyInputSchema>;
export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;
export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;
export type DockerRunInput = z.infer<typeof DockerRunInputSchema>;
export type WslExecInput = z.infer<typeof WslExecInputSchema>;
