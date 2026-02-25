import { createStore } from "solid-js/store";

import type { MemoryCandidate } from "../lib/memory-extractor";

const [memoryCandidates, setMemoryCandidates] = createStore<MemoryCandidate[]>([]);

export function useMemoryCandidates() {
  return { memoryCandidates, setMemoryCandidates };
}

export function addMemoryCandidates(candidates: MemoryCandidate[]) {
  if (!candidates.length) return;
  setMemoryCandidates((prev) => [...candidates, ...prev]);
}

export function dismissMemoryCandidate(target: MemoryCandidate) {
  setMemoryCandidates((items) => items.filter((item) => item !== target));
}

export function clearMemoryCandidates() {
  setMemoryCandidates(() => []);
}
