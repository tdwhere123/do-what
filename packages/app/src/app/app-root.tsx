import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { CoreServicesBootstrap } from './core-services-bootstrap';

function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function AppRoot() {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CoreServicesBootstrap />
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  );
}
