import type { CueWriter } from './cue-writer.js';
import type { RepoCommitter } from './repo-committer.js';

export interface BootstrappingOptions {
  cueWriter: CueWriter;
  onFirstSessionDeepCompile?: (
    projectId: string,
    sessionSummary: string,
  ) => Promise<unknown>;
  repoCommitter: RepoCommitter;
}

export class BootstrappingService {
  private readonly cueWriter: CueWriter;
  private readonly onFirstSessionDeepCompile?: (
    projectId: string,
    sessionSummary: string,
  ) => Promise<unknown>;
  private readonly repoCommitter: RepoCommitter;

  constructor(options: BootstrappingOptions) {
    this.cueWriter = options.cueWriter;
    this.onFirstSessionDeepCompile = options.onFirstSessionDeepCompile;
    this.repoCommitter = options.repoCommitter;
  }

  async firstSessionDeepCompile(
    projectId: string,
    sessionSummary: string,
  ): Promise<{ deferred: boolean }> {
    if (!this.onFirstSessionDeepCompile) {
      return { deferred: true };
    }

    await this.onFirstSessionDeepCompile(projectId, sessionSummary);
    return { deferred: false };
  }

  async seedMemory(projectId: string, seeds: readonly string[]): Promise<string[]> {
    const cueIds: string[] = [];
    for (const seed of seeds) {
      const cueDraft = {
        anchors: [seed],
        gist: seed,
        pointers: [],
        source: 'bootstrap.seed',
      };
      const result = await this.cueWriter.upsert({
        confidence: 0.85,
        cueDraft,
        impactLevel: 'consolidated',
        projectId,
      });
      cueIds.push(result.cueId);
      await this.repoCommitter.commitCue({
        cueDraft,
        cueId: result.cueId,
        impactLevel: result.impactLevel,
        projectId,
      });
    }

    return cueIds;
  }
}
