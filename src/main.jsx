import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { ToastProvider, Spinner } from './components/ui'
import './index.css'
import { sendQrBeacon } from './services/qrBeacon'

window.addEventListener('vite:preloadError', () => {
  const p = window.location.pathname.replace(/\/+$/, '') || '/'
  if (p === '/order') {
    sendQrBeacon('error_chunk')
    if (!sessionStorage.getItem('reloaded_on_chunk_error')) {
      sessionStorage.setItem('reloaded_on_chunk_error', '1')
      window.location.reload()
    }
  }
})

class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    const p = window.location.pathname.replace(/\/+$/, '') || '/'
    if (p === '/order') {
      sendQrBeacon('error_chunk');
      if (!sessionStorage.getItem('reloaded_on_chunk_error')) {
        sessionStorage.setItem('reloaded_on_chunk_error', '1');
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      // /order reloads itself once first (componentDidCatch); everywhere else, or if the
      // reload didn't help, show a refresh button instead of a blank page.
      const isOrder = (window.location.pathname.replace(/\/+$/, '') || '/') === '/order'
      if (!isOrder || sessionStorage.getItem('reloaded_on_chunk_error')) {
        return (
          <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
            <p className="text-lg mb-4 text-gray-700 font-medium">โหลดหน้าไม่สำเร็จ ลองรีเฟรชอีกครั้งนะคะ</p>
            <button 
              onClick={() => { sessionStorage.removeItem('reloaded_on_chunk_error'); window.location.reload(); }}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg shadow"
            >
              รีเฟรช
            </button>
          </div>
        );
      }
      return null;
    }
    return this.props.children;
  }
}

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
      <ChunkErrorBoundary>
        <Suspense fallback={Fallback}>
          {isMemberCard ? <MemberCardApp /> : isCustomerOrder ? <CustomerOrderApp /> : <App />}
        </Suspense>
      </ChunkErrorBoundary>
    </ToastProvider>
  </React.StrictMode>,
)
