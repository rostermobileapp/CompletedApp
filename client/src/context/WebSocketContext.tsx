import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

type WebSocketEventHandler = (data: any) => void;

interface WebSocketContextValue {
  send: (data: any) => void;
  subscribe: (eventType: string, handler: WebSocketEventHandler) => () => void;
  isConnected: () => boolean;
  onConnected: (fn: () => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const FALLBACK_POLL_INTERVAL = 120000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTokenRef = useRef(0);
  const listenersRef = useRef<Map<string, Set<WebSocketEventHandler>>>(new Map());
  const connectListenersRef = useRef<Set<() => void>>(new Set());

  const { data: userData } = useQuery<{ id: string }>({
    queryKey: ['/api/user'],
  });

  const userId = userData?.id;

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((eventType: string, handler: WebSocketEventHandler) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(handler);
    return () => {
      listenersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  const isConnected = useCallback(() => {
    return wsRef.current?.readyState === WebSocket.OPEN || false;
  }, []);

  const onConnected = useCallback((fn: () => void) => {
    connectListenersRef.current.add(fn);
    return () => {
      connectListenersRef.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const currentToken = ++connectionTokenRef.current;

    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    let wsUrl: string;
    try {
      const origin = window.location.origin;
      wsUrl = origin.replace('https:', 'wss:').replace('http:', 'ws:') + '/ws';
    } catch (error) {
      console.warn('[WebSocket] Failed to get origin:', error);
      wsUrl = 'ws://localhost:5000/ws';
    }

    const startFallbackPolling = () => {
      if (connectionTokenRef.current !== currentToken) return;
      if (fallbackIntervalRef.current) return;

      fallbackIntervalRef.current = setInterval(() => {
        if (connectionTokenRef.current !== currentToken) {
          if (fallbackIntervalRef.current) {
            clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = null;
          }
          return;
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/notification-counts'] });
          queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
          queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count'] });
          queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count-per-conversation'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/calendar'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
        }
      }, FALLBACK_POLL_INTERVAL);
    };

    const stopFallbackPolling = () => {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };

    const connect = () => {
      if (connectionTokenRef.current !== currentToken) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        if (connectionTokenRef.current !== currentToken) {
          websocket.close();
          return;
        }

        wsRef.current = websocket;
        reconnectAttemptRef.current = 0;
        stopFallbackPolling();

        websocket.send(JSON.stringify({
          type: 'authenticate',
          userId: userId
        }));

        // Fire all registered connect listeners so subscribers can re-register
        // server-side subscriptions (e.g. draft_subscribe) after a reconnect.
        connectListenersRef.current.forEach(fn => {
          try { fn(); } catch (e) { /* ignore */ }
        });
      };

      websocket.onmessage = (event) => {
        if (connectionTokenRef.current !== currentToken) return;

        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'schedule_update':
              queryClient.invalidateQueries({ queryKey: ['/api/user/calendar'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
              break;

            case 'message':
              queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
              queryClient.invalidateQueries({ queryKey: ['/api/conversations', data.conversationId, 'messages'] });
              queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count'] });
              queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count-per-conversation'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/notification-counts'] });
              queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
              queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
              break;

            case 'read_receipt':
            case 'message_read':
              if (data.conversationId) {
                queryClient.invalidateQueries({ queryKey: ['/api/conversations', data.conversationId, 'messages'] });
              }
              queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count'] });
              queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count-per-conversation'] });
              break;

            case 'poll_created':
              if (data.conversationId) {
                queryClient.invalidateQueries({ queryKey: ['/api/conversations', data.conversationId, 'messages'] });
                queryClient.invalidateQueries({ queryKey: ['/api/messages', data.messageId, 'polls'] });
              }
              break;

            case 'poll_vote':
              if (data.pollId) {
                queryClient.invalidateQueries({ queryKey: ['/api/chat-polls', data.pollId, 'results'] });
              }
              break;

            case 'poll_closed':
              if (data.pollId) {
                queryClient.invalidateQueries({ queryKey: ['/api/chat-polls', data.pollId, 'results'] });
              }
              if (data.messageId) {
                queryClient.invalidateQueries({ queryKey: ['/api/messages', data.messageId, 'polls'] });
              }
              break;

            case 'notification_update':
              queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
              queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/notification-counts'] });
              break;
          }

          const handlers = listenersRef.current.get(data.type);
          if (handlers) {
            handlers.forEach(handler => handler(data));
          }
        } catch (error) {
          console.error('[WebSocket] Message parse error:', error);
        }
      };

      websocket.onclose = () => {
        if (connectionTokenRef.current !== currentToken) return;

        wsRef.current = null;
        startFallbackPolling();

        const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
        reconnectAttemptRef.current++;

        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      websocket.onerror = () => {
        websocket.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopFallbackPolling();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [userId]);

  return (
    <WebSocketContext.Provider value={{ send, subscribe, isConnected, onConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
