import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Bell, BellRing, Plus, Trash2, X, ChevronUp, ChevronDown, Volume2 } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { getTradingTerminalApiUrl } from '../env';

const AlertPanel = ({ symbol, currentPrice, isOpen, onClose, triggeredAlerts, setTriggeredAlerts }) => {
  const API = getTradingTerminalApiUrl();
  const restAlertsEnabled = Boolean(API);
  const [alerts, setAlerts] = useState([]);
  const [newPrice, setNewPrice] = useState('');
  const [newCondition, setNewCondition] = useState('above');
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    if (!API) {
      setAlerts([]);
      return;
    }
    try {
      const url = symbol ? `${API}/alerts?symbol=${symbol}` : `${API}/alerts`;
      const response = await axios.get(url);
      setAlerts(response.data);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  }, [symbol, API]);

  useEffect(() => {
    if (isOpen) fetchAlerts();
  }, [isOpen, fetchAlerts]);

  const createAlert = useCallback(async () => {
    if (!API || !newPrice || !symbol) return;
    setLoading(true);
    try {
      await axios.post(`${API}/alerts`, {
        symbol,
        price: parseFloat(newPrice),
        condition: newCondition,
      });
      setNewPrice('');
      await fetchAlerts();
    } catch (err) {
      console.error('Error creating alert:', err);
    } finally {
      setLoading(false);
    }
  }, [newPrice, newCondition, symbol, fetchAlerts, API]);

  const deleteAlert = useCallback(async (alertId) => {
    if (!API) return;
    try {
      await axios.delete(`${API}/alerts/${alertId}`);
      await fetchAlerts();
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  }, [fetchAlerts, API]);

  const dismissTriggered = useCallback((alertId) => {
    setTriggeredAlerts(prev => prev.filter(a => a.alert_id !== alertId));
  }, [setTriggeredAlerts]);

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-80 glass-panel shadow-2xl animate-fade-in" data-testid="alert-panel">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#F59E0B]" />
          <span className="font-heading font-medium text-sm">Price Alerts</span>
          <span className="text-[10px] font-mono text-slate-500">{symbol}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white" data-testid="alert-panel-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!restAlertsEnabled ? (
        <div className="px-3 py-2 border-b border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-200/90 leading-snug">
          Price alerts (create/list/delete) need <span className="font-mono text-amber-100/90">VITE_TRADING_TERMINAL_API_URL</span> (legacy terminal API).
          Triggered alerts from the chart WebSocket still show above when the Python backend pushes them.
        </div>
      ) : null}

      {/* Triggered alerts */}
      {triggeredAlerts?.length > 0 && (
        <div className="p-2 border-b border-white/10 space-y-1">
          {triggeredAlerts.map((ta, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/20 animate-fade-in" data-testid={`triggered-alert-${i}`}>
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-[#F59E0B] animate-pulse" />
                <div>
                  <p className="text-xs text-[#F59E0B] font-medium">{ta.label}</p>
                  <p className="text-[10px] text-slate-400 font-mono">Hit at {ta.price?.toFixed(4)}</p>
                </div>
              </div>
              <button onClick={() => dismissTriggered(ta.alert_id)} className="text-slate-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create alert */}
      <div className={`p-3 border-b border-white/10 ${restAlertsEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-white/10 rounded-md overflow-hidden">
            <button
              onClick={() => setNewCondition('above')}
              className={`px-2 py-1.5 text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${
                newCondition === 'above' ? 'bg-[#00E676]/20 text-[#00E676]' : 'text-slate-500 hover:text-white'
              }`}
              data-testid="alert-condition-above"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => setNewCondition('below')}
              className={`px-2 py-1.5 text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${
                newCondition === 'below' ? 'bg-[#FF3B30]/20 text-[#FF3B30]' : 'text-slate-500 hover:text-white'
              }`}
              data-testid="alert-condition-below"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <input
            type="number"
            step="any"
            value={newPrice}
            onChange={e => setNewPrice(e.target.value)}
            placeholder={currentPrice?.toFixed(4) || 'Price'}
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-[#3B82F6]/50"
            onKeyDown={e => e.key === 'Enter' && createAlert()}
            data-testid="alert-price-input"
          />
          <Button
            size="sm"
            onClick={createAlert}
            disabled={loading || !newPrice}
            className="bg-[#3B82F6] hover:bg-[#2563EB] h-8 px-3"
            data-testid="alert-create-button"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Active alerts list */}
      <ScrollArea className="max-h-48">
        <div className="p-2 space-y-1">
          {alerts.length === 0 ? (
            <p className="text-center text-slate-600 text-xs py-4">
              {restAlertsEnabled ? `No active alerts for ${symbol}` : 'REST API disabled — configure terminal URL to manage saved alerts.'}
            </p>
          ) : (
            alerts.map(alert => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-2 rounded-md transition-colors ${
                  alert.triggered ? 'bg-white/5 opacity-50' : 'hover:bg-white/[0.03]'
                }`}
                data-testid={`alert-item-${alert.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    alert.condition === 'above' ? 'bg-[#00E676]' : 'bg-[#FF3B30]'
                  }`} />
                  <div>
                    <p className="text-xs font-mono text-white">
                      {alert.condition === 'above' ? '>' : '<'} {alert.price?.toFixed(4)}
                    </p>
                    {alert.label && (
                      <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{alert.label}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="text-slate-600 hover:text-[#FF3B30] transition-colors"
                  data-testid={`alert-delete-${alert.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AlertPanel;
