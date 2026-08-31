import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

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

function invalidateRealtimeQueries() {
  queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
  queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
  queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/unpaid-count'] });
  queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmage-requests'] });
  queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-requests'] });
  queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
  queryClient.invalidateQueries({ queryKey: ['/api/user/calendar'] });
  queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
  queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      if (typeof key !== 'string') return false;
      return (
        (key.startsWith('/api/games/') && (key.includes('/rsvp') || key.endsWith('/full'))) ||
        key.startsWith('/api/team-events/') ||
        key === '/api/scrimmages' ||
        key.startsWith('/api/scrimmages/') ||
        key.startsWith('/api/payment-requests/')
      );
    },
  });
}

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
          queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
          queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
          queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/unpaid-count'] });
          queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmage-requests'] });
          queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-requests'] });
          queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
          invalidateRealtimeQueries();
        }
      }, FALLBACK_POLL_INTERVAL);
    };

    const stopFallbackPolling = () => {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };

    const connect = async () => {
      if (connectionTokenRef.current !== currentToken) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (connectionTokenRef.current !== currentToken) return;
      if (!session?.access_token) {
        startFallbackPolling();
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
        reconnectAttemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
        return;
      }
      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        if (connectionTokenRef.current !== currentToken) {
          websocket.close();
          return;
        }

        wsRef.current = websocket;
        reconnectAttemptRef.current = 0;

        websocket.send(JSON.stringify({
          type: 'authenticate',
          accessToken: session.access_token,
        }));
      };

      websocket.onmessage = (event) => {
        if (connectionTokenRef.current !== currentToken) return;

        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'authenticated':
              stopFallbackPolling();
              // Reconcile changes that may have happened while disconnected,
              // then re-register server-side subscriptions.
              invalidateRealtimeQueries();
              connectListenersRef.current.forEach(fn => {
                try { fn(); } catch (e) { /* ignore */ }
              });
              break;

            case 'authentication_error':
              websocket.close();
              break;

            case 'schedule_update':
              queryClient.invalidateQueries({ queryKey: ['/api/user/calendar'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
              break;

            case 'message':
              // If the WebSocket payload includes the full message object, write it
              // directly into the cache so it appears instantly without a round-trip.
              if (data.conversationId && data.message?.id) {
                const cacheKey = ['/api/conversations', data.conversationId, 'messages'];
                const existing = queryClient.getQueryData<any[]>(cacheKey);
                if (existing) {
                  // Avoid duplicates (sender may have already added it via mutation)
                  const alreadyPresent = existing.some((m: any) => m.id === data.message.id);
                  if (!alreadyPresent) {
                    queryClient.setQueryData(cacheKey, [...existing, data.message]);
                  }
                }
              }
              // Invalidate for full reconciliation (ordering, attachments, etc.)
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

            case 'reaction_update':
              // Surgically update the specific message's reactions in the cache
              if (data.messageId && data.conversationId) {
                const cacheKey = ['/api/conversations', data.conversationId, 'messages'];
                const existing = queryClient.getQueryData<any[]>(cacheKey);
                if (existing) {
                  queryClient.setQueryData(
                    cacheKey,
                    existing.map((m: any) =>
                      m.id === data.messageId ? { ...m, reactions: data.reactions } : m,
                    ),
                  );
                }
              }
              break;

            case 'notification_update':
              queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
              queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/notification-counts'] });
              break;

            case 'rsvp_update':
              if (data.gameId) {
                queryClient.invalidateQueries({
                  predicate: (query) => {
                    const key = query.queryKey[0];
                    return typeof key === 'string' && key.startsWith(`/api/games/${data.gameId}/rsvp`);
                  },
                });
                queryClient.invalidateQueries({ queryKey: [`/api/games/${data.gameId}/full`] });
              }
              if (data.teamEventId) {
                queryClient.invalidateQueries({ queryKey: [`/api/team-events/${data.teamEventId}`] });
              }
              queryClient.invalidateQueries({ queryKey: ['/api/user/calendar'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/team-events'] });
              break;

            case 'scrimmage_update':
              queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmage-requests'] });
              queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-requests'] });
              queryClient.invalidateQueries({ queryKey: ['/api/users', 'scrimmages'] });
              if (data.scrimmageId) {
                queryClient.invalidateQueries({ queryKey: ['/api/scrimmages', data.scrimmageId, 'requests'] });
                queryClient.invalidateQueries({ queryKey: [`/api/scrimmages/${data.scrimmageId}/approved-players`] });
                queryClient.invalidateQueries({ queryKey: [`/api/scrimmages/${data.scrimmageId}/payment-requests`] });
                queryClient.invalidateQueries({ queryKey: [`/api/scrimmages/${data.scrimmageId}`] });
              }
              queryClient.invalidateQueries({ queryKey: ['/api/user/calendar'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
              break;

            case 'payment_update':
              queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
              queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
              queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/unpaid-count'] });
              if (data.paymentRequestId) {
                queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${data.paymentRequestId}`] });
              }
              if (data.scrimmageId) {
                queryClient.invalidateQueries({ queryKey: [`/api/scrimmages/${data.scrimmageId}/payment-requests`] });
              }
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
