import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ApiError } from './api.ts';
import './index.css';

// a 4xx is the server's answer, so asking again would only repeat it
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (failures, error) => failures < 3 && !(error instanceof ApiError && error.status < 500) },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
