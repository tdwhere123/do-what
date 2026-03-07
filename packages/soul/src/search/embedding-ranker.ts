export class EmbeddingRanker {
  async rank<T extends { score: number }>(
    _query: string,
    cues: readonly T[],
  ): Promise<T[]> {
    return [...cues];
  }
}
