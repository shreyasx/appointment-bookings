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

// Safari and Firefox may restore the booking page from the back-forward cache after Back from the confirmation, with Confirm stuck on "Booking…"
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
