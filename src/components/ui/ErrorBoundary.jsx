import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-[var(--bg-primary)] p-8">
          <div className="w-20 h-20 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-500 mb-6">
            <AlertTriangle size={40} />
          </div>
          <h2 className="text-xl font-black text-[var(--text-primary)] mb-2">
            เกิดข้อผิดพลาด
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-6 text-center max-w-md">
            {this.state.error?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-colors"
          >
            <RefreshCcw size={16} />
            ลองใหม่
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.displayName = 'ErrorBoundary';

export default ErrorBoundary;
