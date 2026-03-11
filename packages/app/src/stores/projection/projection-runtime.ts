import type { NormalizedEventBus } from '../../lib/events';
import { resetProjectionStore, useProjectionStore } from './projection-store';

export interface ProjectionRuntimeDependencies {
  readonly eventBus: NormalizedEventBus;
}

export function startProjectionRuntime(
  dependencies: ProjectionRuntimeDependencies,
): () => void {
  resetProjectionStore();

  const unsubscribe = dependencies.eventBus.subscribe((message) => {
    if (message.kind === 'event') {
      useProjectionStore.getState().applyNormalizedEvent(message.event);
    }
  });

  return () => {
    unsubscribe();
    resetProjectionStore();
  };
}
