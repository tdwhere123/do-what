import type { MemoryRepoManager } from '../repo/memory-repo-manager.js';
import {
  normalizeCueDraft,
  type CueImpactLevel,
} from './draft-normalizer.js';

export interface RepoCommitterInput {
  cueDraft: Record<string, unknown>;
  cueId: string;
  impactLevel: CueImpactLevel;
  projectId: string;
}

export interface RepoCommitResult {
  commitSha?: string;
  committed: boolean;
}

export interface RepoCommitterOptions {
  memoryRepoManager: MemoryRepoManager;
}

export class RepoCommitter {
  private readonly memoryRepoManager: MemoryRepoManager;

  constructor(options: RepoCommitterOptions) {
    this.memoryRepoManager = options.memoryRepoManager;
  }

  async commitCue(input: RepoCommitterInput): Promise<RepoCommitResult> {
    if (input.impactLevel === 'working') {
      return { committed: false };
    }

    try {
      const project = await this.memoryRepoManager.ensureProject(input.projectId);
      const commitSha = await this.memoryRepoManager.commit(
        project.memoryRepoPath,
        buildCommitMessage(input.cueDraft),
        [
          {
            content: buildCueMarkdown(input.cueId, input.cueDraft, input.impactLevel),
            path: `memory_cues/${input.cueId}.md`,
          },
        ],
      );
      return {
        commitSha,
        committed: true,
      };
    } catch (error) {
      console.warn('[soul][repo-committer] failed to sync cue into memory_repo', error);
      return {
        committed: false,
      };
    }
  }
}

function buildCommitMessage(cueDraft: Record<string, unknown>): string {
  const normalizedCue = normalizeCueDraft(cueDraft, 'working');
  const dimension = normalizedCue.dimension ?? 'cue';
  const truncatedGist = normalizedCue.gist.length > 50
    ? `${normalizedCue.gist.slice(0, 47)}...`
    : normalizedCue.gist;
  return `feat(memory): add ${dimension} cue - ${truncatedGist}`;
}

function buildCueMarkdown(
  cueId: string,
  cueDraft: Record<string, unknown>,
  impactLevel: CueImpactLevel,
): string {
  const normalizedCue = normalizeCueDraft(cueDraft, impactLevel);
  const sections = [
    `# ${normalizedCue.gist}`,
    '',
    `- cue_id: ${cueId}`,
    `- source: ${normalizedCue.source}`,
    `- formation_kind: ${normalizedCue.formationKind ?? ''}`,
    `- dimension: ${normalizedCue.dimension ?? ''}`,
    `- impact_level: ${impactLevel}`,
    `- anchors: ${normalizedCue.anchors.join(', ')}`,
    `- confidence: ${normalizedCue.confidence ?? ''}`,
    '',
    '## Pointers',
  ];

  if (normalizedCue.pointers.length === 0) {
    sections.push('- (none)');
  } else {
    sections.push(...normalizedCue.pointers.map((pointer) => `- ${pointer}`));
  }

  if (normalizedCue.summary) {
    sections.push('', '## Summary', normalizedCue.summary);
  }

  return `${sections.join('\n')}\n`;
}
