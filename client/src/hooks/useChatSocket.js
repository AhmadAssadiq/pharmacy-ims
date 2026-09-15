import { useCallback, useEffect, useRef, useState } from 'react';
import { getToken } from '../api/client';

const RECONNECT_DELAY_MS = 2000;

/**
 * Keeps a WebSocket connection to the chat hub open for the lifetime of the
 * component, reconnecting automatically. `onEvent` receives every parsed
 * frame from the server; `send` transmits a message frame and returns false
 * when the socket is not open (callers then fall back to HTTP).
 */
export default function useChatSocket(onEvent) {
  const [status, setStatus] = useState('connecting');
  const socketRef = useRef(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let closed = false;
    let reconnectTimer = null;

    const connect = () => {
      const token = getToken();
      if (!token || closed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      socketRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => setStatus('online');
      ws.onmessage = (event) => {
        try {
          handlerRef.current?.(JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setStatus('offline');
        socketRef.current = null;
        if (!closed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((frame) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(frame));
    return true;
  }, []);

  return { status, send };
}
