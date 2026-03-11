import { useEffect } from 'react';
import { getAppServices } from '../lib/runtime/app-services';
import { startAppStoreRuntime } from '../stores/app-store-runtime';

export function CoreServicesBootstrap() {
  useEffect(() => {
    const services = getAppServices();
    const stopStores = startAppStoreRuntime(services);
    const stop = services.eventClient.start();
    return () => {
      stop();
      stopStores();
    };
  }, []);

  return null;
}
