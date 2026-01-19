import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const FALLBACK_POLL_INTERVAL = 120000;

export function useNotificationWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTokenRef = useRef(0);
  
  const { data: userData } = useQuery<{ id: string }>({
    queryKey: ['/api/user'],
  });
  
  const userId = userData?.id;
  
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
      console.warn('[NotificationWS] Failed to get origin:', error);
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
      };
      
      websocket.onmessage = (event) => {
        if (connectionTokenRef.current !== currentToken) return;
        
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'notification_update') {
            queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
            queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
            queryClient.invalidateQueries({ queryKey: ['/api/user/notification-counts'] });
          }
        } catch (error) {
          console.error('[NotificationWS] Message parse error:', error);
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
  
  return wsRef;
}
