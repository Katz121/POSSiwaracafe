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
          <div className="w-20 h-20 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--state-danger)] mb-6">
            <AlertTriangle size={40} />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            เกิดข้อผิดพลาด
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-6 text-center max-w-md">
            {this.state.error?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--accent-emerald)] text-white rounded-[var(--radius-sm)] font-bold text-sm hover:bg-[var(--accent-emerald-dark)] transition-colors"
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
