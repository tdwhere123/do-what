import { useEffect } from 'react';
import { getAppServices } from '../lib/runtime/app-services';

export function CoreServicesBootstrap() {
  useEffect(() => {
    const stop = getAppServices().eventClient.start();
    return () => {
      stop();
    };
  }, []);

  return null;
}
