import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { ToastProvider, Spinner } from './components/ui'
import './index.css'

// Lazy-load the two entry points so the customer ordering page does not pull
// in the full admin/POS bundle (and vice versa).
const App = lazy(() => import('./App.jsx'))
const CustomerOrderApp = lazy(() => import('./customer/CustomerOrderApp.jsx'))

// Simple path-based routing without a router library (project convention: no router).
// The shop-wide QR code points to "/order" → render the customer self-ordering page.
const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
const isCustomerOrder = pathname === '/order'

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              console.log('[PWA] New version available');
            }
          });
        });
      })
      .catch((error) => {
        console.log('[PWA] Service Worker registration failed:', error);
      });
  });
}

const Fallback = (
  <div className="min-h-screen flex items-center justify-center">
    <Spinner />
  </div>
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <Suspense fallback={Fallback}>
        {isCustomerOrder ? <CustomerOrderApp /> : <App />}
      </Suspense>
    </ToastProvider>
  </React.StrictMode>,
)
