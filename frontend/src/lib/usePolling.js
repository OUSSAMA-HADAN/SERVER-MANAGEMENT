import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Poll `fetcher(signal)` every `interval` ms while the page is visible.
 * Pauses in background tabs, refreshes on return, never overlaps requests.
 */
export function usePolling(fetcher, interval, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const ctrl = useRef(null);
  const timer = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    try {
      const result = await fetcherRef.current(c.signal);
      if (c.signal.aborted) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e);
    } finally {
      if (!c.signal.aborted) {
        setLoading(false);
        if (enabledRef.current && interval && document.visibilityState === 'visible') {
          timer.current = setTimeout(run, interval);
        }
      }
    }
  }, [interval]);

  useEffect(() => {
    if (!enabled) { clearTimeout(timer.current); return undefined; }
    run();
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
      else clearTimeout(timer.current);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(timer.current);
      ctrl.current?.abort();
    };
  }, [run, enabled]);

  return { data, error, loading, refresh: run, setData };
}
