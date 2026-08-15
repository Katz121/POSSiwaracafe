import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { ToastProvider, Spinner } from './components/ui'
import './index.css'

// Lazy-load the two entry points so the customer ordering page does not pull
// in the full admin/POS bundle (and vice versa).
const App = lazy(() => import('./App.jsx'))
const CustomerOrderApp = lazy(() => import('./customer/CustomerOrderApp.jsx'))
const MemberCardApp = lazy(() => import('./customer/MemberCardApp.jsx'))

// Simple path-based routing without a router library (project convention: no router).
// The shop-wide QR code points to "/order" → render the customer self-ordering page.
// The LINE rich menu's "สะสมแต้ม" button points to "/member" → member points card.
const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
const isCustomerOrder = pathname === '/order'
const isMemberCard = pathname === '/member'

const Fallback = (
  <div className="min-h-screen flex items-center justify-center">
    <Spinner />
  </div>
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <Suspense fallback={Fallback}>
        {isMemberCard ? <MemberCardApp /> : isCustomerOrder ? <CustomerOrderApp /> : <App />}
      </Suspense>
    </ToastProvider>
  </React.StrictMode>,
)
