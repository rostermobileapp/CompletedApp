// Temporary debug component to check when NativelyNotifications becomes available
// Add this to your App.tsx temporarily to diagnose the timing issue

import { useEffect, useState } from 'react';

export function NativelyBridgeDebug() {
  const [logs, setLogs] = useState<string[]>([]);
  const [bridgeAvailable, setBridgeAvailable] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(`[Bridge Debug] ${message}`);
  };

  useEffect(() => {
    addLog('Component mounted');
    addLog(`Document ready state: ${document.readyState}`);
    addLog(`window.NativelyNotifications: ${typeof window.NativelyNotifications}`);

    // Check immediately
    if (window.NativelyNotifications) {
      setBridgeAvailable(true);
      addLog('✅ NativelyNotifications is available immediately');
      
      try {
        const instance = new window.NativelyNotifications();
        addLog('✅ Can create instance');
        addLog(`Methods: ${Object.keys(instance).join(', ')}`);
      } catch (err) {
        addLog(`❌ Error creating instance: ${err}`);
      }
    } else {
      addLog('⚠️ NativelyNotifications not available yet, polling...');
    }

    // Poll every 100ms for 30 seconds
    let pollCount = 0;
    const maxPolls = 300; // 30 seconds
    
    const pollInterval = setInterval(() => {
      pollCount++;
      
      if (window.NativelyNotifications && !bridgeAvailable) {
        clearInterval(pollInterval);
        setBridgeAvailable(true);
        addLog(`✅ NativelyNotifications became available after ${pollCount * 100}ms`);
        
        try {
          const instance = new window.NativelyNotifications();
          addLog('✅ Can create instance');
          
          const methods = Object.keys(instance);
          addLog(`Available methods (${methods.length}): ${methods.join(', ')}`);
          
          // Check specific methods
          addLog(`Has login(): ${typeof instance.login === 'function'}`);
          addLog(`Has setExternalId(): ${typeof instance.setExternalId === 'function'}`);
          addLog(`Has getOneSignalId(): ${typeof instance.getOneSignalId === 'function'}`);
          
        } catch (err) {
          addLog(`❌ Error creating instance: ${err}`);
        }
      } else if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        addLog(`❌ Polling timeout after ${maxPolls * 100}ms - bridge never became available`);
        
        // Check what IS available
        const windowKeys = Object.keys(window).filter(key => 
          key.toLowerCase().includes('onesignal') || 
          key.toLowerCase().includes('natively') ||
          key.toLowerCase().includes('notification')
        );
        addLog(`Related window properties: ${windowKeys.join(', ') || 'none'}`);
      }
    }, 100);

    // Listen for various load events
    const handleDOMContentLoaded = () => addLog('Event: DOMContentLoaded');
    const handleLoad = () => addLog('Event: load');
    const handleReadyStateChange = () => addLog(`Event: readystatechange (${document.readyState})`);

    document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
    window.addEventListener('load', handleLoad);
    document.addEventListener('readystatechange', handleReadyStateChange);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('DOMContentLoaded', handleDOMContentLoaded);
      window.removeEventListener('load', handleLoad);
      document.removeEventListener('readystatechange', handleReadyStateChange);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '300px',
      overflow: 'auto',
      background: 'rgba(0,0,0,0.9)',
      color: bridgeAvailable ? '#0f0' : '#ff0',
      padding: '10px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999,
      borderTop: '2px solid ' + (bridgeAvailable ? '#0f0' : '#ff0')
    }}>
      <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
        🔍 Natively Bridge Debug
        {bridgeAvailable ? ' ✅ AVAILABLE' : ' ⚠️ WAITING...'}
      </div>
      {logs.map((log, i) => (
        <div key={i}>{log}</div>
      ))}
    </div>
  );
}
