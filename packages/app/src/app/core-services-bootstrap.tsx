import { useEffect } from 'react';
import { normalizeCoreError } from '../lib/contracts';
import { getAppServices } from '../lib/runtime/app-services';
import { startAppStoreRuntime } from '../stores/app-store-runtime';
import { useUiStore } from '../stores/ui';

export function CoreServicesBootstrap() {
  useEffect(() => {
    const services = getAppServices();
    let cleanupStores: (() => void) | null = null;
    let stopEvents: (() => void) | null = null;
    let disposed = false;

    useUiStore.getState().setBootstrapState('loading');

    const bootstrap = async () => {
      try {
        const bootstrapSnapshot = await services.coreApi.getWorkbenchSnapshot();
        if (disposed) {
          return;
        }

        cleanupStores = startAppStoreRuntime(services, {
          bootstrapSnapshot,
        });
        stopEvents = services.eventClient.start();
        useUiStore.getState().setBootstrapState('ready');
      } catch (error) {
        if (disposed) {
          return;
        }

        const message = normalizeCoreError(error, 'Failed to bootstrap workbench').message;
        useUiStore.getState().setBootstrapState('error', message);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
      stopEvents?.();
      cleanupStores?.();
    };
  }, []);

  return null;
}
