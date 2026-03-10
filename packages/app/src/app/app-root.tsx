import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { CoreServicesBootstrap } from './core-services-bootstrap';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <CoreServicesBootstrap />
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  );
}
