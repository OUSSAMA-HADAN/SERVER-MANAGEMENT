import { createContext, useContext, useMemo, useRef } from 'react';
import { api } from './api.js';
import { usePolling } from './usePolling.js';

const HISTORY = 40;
const MetricsContext = createContext({ metrics: null, history: {}, error: null });

/** One shared /api/stats poller for the whole dashboard (strip + overview). */
export function MetricsProvider({ children }) {
  const hist = useRef({ cpu: [], mem: [], rx: [], tx: [] });
  const { data, error } = usePolling(async (signal) => {
    const m = await api('/api/stats', { signal });
    const h = hist.current;
    const push = (arr, v) => [...arr, v].slice(-HISTORY);
    hist.current = {
      cpu: push(h.cpu, m.cpu),
      mem: push(h.mem, m.memTotal ? (m.memUsed / m.memTotal) * 100 : 0),
      rx: push(h.rx, m.rxRate || 0),
      tx: push(h.tx, m.txRate || 0),
    };
    return m;
  }, 3000);
  const value = useMemo(() => ({ metrics: data, history: hist.current, error }), [data, error]);
  return <MetricsContext.Provider value={value}>{children}</MetricsContext.Provider>;
}

export const useMetrics = () => useContext(MetricsContext);
