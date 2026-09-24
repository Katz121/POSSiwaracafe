import React from 'react';
import { AlertTriangle, RefreshCcw, RotateCcw } from 'lucide-react';

/**
 * Staff-facing error screen. Never shows raw (English / Firebase) error text as
 * the message: a Thai sentence + "โหลดใหม่" (full reload), with the technical
 * detail collapsed for whoever debugs it.
 *
 * Props:
 *  - resetKey   when it changes the boundary clears itself (App passes the view key,
 *               so moving to another screen recovers without a reload)
 *  - title / message  override the Thai copy
 *  - compact    smaller layout for embedding inside a card
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const {
      title = 'หน้านี้มีปัญหา ลองโหลดใหม่',
      message = 'ข้อมูลที่บันทึกไปแล้วไม่หาย ถ้าโหลดใหม่แล้วยังเป็นอยู่ ให้แจ้งเจ้าของร้าน',
      compact = false,
    } = this.props;
    const err = this.state.error;
    const detail = [err?.name, err?.message].filter(Boolean).join(': ') || String(err || '');

    return (
      <div
        role="alert"
        className={`${compact ? 'py-8' : 'h-full min-h-[60vh]'} flex flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 text-center`}
      >
        <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-[var(--state-danger-soft)] text-[var(--state-danger)] flex items-center justify-center mb-5">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-xl font-semibold leading-normal text-[var(--text-primary)] mb-1">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-6 max-w-md">
          {message}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 min-h-12 px-6 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--text-on-accent)] font-semibold hover:bg-[var(--accent-hover)] focus-visible:shadow-[var(--focus-ring)] outline-none"
          >
            <RefreshCcw size={18} />
            โหลดใหม่
          </button>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 min-h-12 px-5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)] focus-visible:shadow-[var(--focus-ring)] outline-none"
          >
            <RotateCcw size={16} />
            ลองอีกครั้ง
          </button>
        </div>
        {detail && (
          <details className="mt-6 w-full max-w-md text-left">
            <summary className="cursor-pointer select-none text-xs text-[var(--text-muted)] py-2">
              รายละเอียดทางเทคนิค
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-3 text-xs text-[var(--text-secondary)]">
              {detail}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

ErrorBoundary.displayName = 'ErrorBoundary';

export default ErrorBoundary;
