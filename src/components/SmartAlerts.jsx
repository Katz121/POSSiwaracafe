/**
 * SmartAlerts Component
 * Displays AI-powered alerts based on shop data
 */
import React, { useMemo, useState } from 'react';
import {
  Bell, Package, TrendingDown, DollarSign, Trophy, Clock, Trash2,
  X, ChevronRight, AlertTriangle, CheckCircle2, Info
} from 'lucide-react';
import { generateSmartAlerts, getAlertColor, ALERT_SEVERITY } from '../services/alertService';

const ICON_MAP = {
  Package,
  TrendingDown,
  DollarSign,
  Trophy,
  Clock,
  Trash2,
  Bell
};

const SEVERITY_ICONS = {
  [ALERT_SEVERITY.CRITICAL]: AlertTriangle,
  [ALERT_SEVERITY.WARNING]: AlertTriangle,
  [ALERT_SEVERITY.SUCCESS]: CheckCircle2,
  [ALERT_SEVERITY.INFO]: Info
};

export default function SmartAlerts({ data, onAction, compact = false }) {
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const alerts = useMemo(() => {
    const all = generateSmartAlerts(data);
    return all.filter(a => !dismissedAlerts.includes(a.id));
  }, [data, dismissedAlerts]);

  const dismissAlert = (alertId) => {
    setDismissedAlerts(prev => [...prev, alertId]);
  };

  const handleAction = (alert) => {
    if (alert.action && onAction) {
      onAction(alert.action.view, alert);
    }
  };

  if (alerts.length === 0) {
    return null;
  }

  // Compact mode - just show count badge
  if (compact) {
    const criticalCount = alerts.filter(a => a.severity === ALERT_SEVERITY.CRITICAL).length;
    const warningCount = alerts.filter(a => a.severity === ALERT_SEVERITY.WARNING).length;

    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative p-3 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all"
      >
        <Bell size={22} className="text-gray-600" />
        {alerts.length > 0 && (
          <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center text-white ${criticalCount > 0 ? 'bg-red-500' : warningCount > 0 ? 'bg-amber-500' : 'bg-blue-500'}`}>
            {alerts.length}
          </span>
        )}

        {/* Dropdown */}
        {isExpanded && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in slide-in-from-top-2">
            <div className="p-4 bg-gray-50 border-b border-gray-100">
              <h4 className="font-black text-sm text-gray-800">การแจ้งเตือน ({alerts.length})</h4>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {alerts.map(alert => {
                const colors = getAlertColor(alert.severity);
                const SeverityIcon = SEVERITY_ICONS[alert.severity];

                return (
                  <div
                    key={alert.id}
                    className={`p-4 border-b border-gray-50 ${colors.bg} hover:brightness-95 transition-all cursor-pointer`}
                    onClick={() => handleAction(alert)}
                  >
                    <div className="flex items-start gap-3">
                      <SeverityIcon size={18} className={colors.icon} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm ${colors.text}`}>{alert.title}</p>
                        <p className="text-xs text-gray-500 mt-1 truncate">{alert.message}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}
                        className="p-1 hover:bg-white/50 rounded-lg"
                      >
                        <X size={14} className="text-gray-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </button>
    );
  }

  // Full mode - show all alerts
  return (
    <div className="space-y-3 animate-in slide-in-from-top duration-500">
      {alerts.slice(0, 3).map(alert => {
        const colors = getAlertColor(alert.severity);
        const SeverityIcon = SEVERITY_ICONS[alert.severity];

        return (
          <div
            key={alert.id}
            className={`${colors.bg} ${colors.border} border-2 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all group`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colors.bg} border ${colors.border}`}>
              <SeverityIcon size={24} className={colors.icon} />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className={`font-black text-sm ${colors.text}`}>{alert.title}</h4>
              <p className="text-xs text-gray-500 mt-1">{alert.message}</p>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {alert.action && (
                <button
                  onClick={() => handleAction(alert)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${colors.text} bg-white border ${colors.border} hover:scale-105 transition-transform flex items-center gap-1`}
                >
                  {alert.action.label} <ChevronRight size={12} />
                </button>
              )}
              <button
                onClick={() => dismissAlert(alert.id)}
                className="p-2 hover:bg-white/50 rounded-xl transition-colors"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>
          </div>
        );
      })}

      {alerts.length > 3 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-3 text-center text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
        >
          {isExpanded ? 'ซ่อน' : `ดูเพิ่มเติม (${alerts.length - 3} รายการ)`}
        </button>
      )}

      {isExpanded && alerts.slice(3).map(alert => {
        const colors = getAlertColor(alert.severity);
        const SeverityIcon = SEVERITY_ICONS[alert.severity];

        return (
          <div
            key={alert.id}
            className={`${colors.bg} ${colors.border} border rounded-xl p-4 flex items-center gap-3`}
          >
            <SeverityIcon size={18} className={colors.icon} />
            <div className="flex-1">
              <p className={`font-bold text-xs ${colors.text}`}>{alert.title}</p>
              <p className="text-[10px] text-gray-500">{alert.message}</p>
            </div>
            <button onClick={() => dismissAlert(alert.id)} className="p-1">
              <X size={14} className="text-gray-400" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
