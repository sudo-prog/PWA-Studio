import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('SW registered: ', registration);
    }).catch((registrationError) => {
      console.log('SW registration failed: ', registrationError);
    });

    // Listen for SW sync messages to drain the offline queue
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_AGENT_QUEUE') {
        // Dynamically import to avoid circular dep at module load time
        import('./hooks/use-offline-queue').then(({ useOfflineQueue: _unused }) => {
          // useOfflineQueue is a hook and can't be called here directly.
          // We dispatch a CustomEvent that AppLayout listens to instead.
          window.dispatchEvent(new CustomEvent('sw-sync-agent-queue'));
        });
      }
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
