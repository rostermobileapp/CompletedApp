/**
 * OneSignal Cleanup Utility
 * 
 * Use this to completely clear all OneSignal data from browser storage.
 * This is useful when debugging or resetting OneSignal configuration.
 */

export async function clearOneSignalData(): Promise<void> {
  console.log('[Cleanup] Starting OneSignal data cleanup...');

  try {
    // 1. Clear IndexedDB databases
    if ('indexedDB' in window) {
      try {
        const databases = await window.indexedDB.databases();
        for (const db of databases) {
          if (db.name && (db.name.includes('OneSignal') || db.name.includes('onesignal'))) {
            console.log('[Cleanup] Deleting IndexedDB:', db.name);
            window.indexedDB.deleteDatabase(db.name);
          }
        }
      } catch (error) {
        console.error('[Cleanup] IndexedDB cleanup failed:', error);
      }
    }

    // 2. Clear localStorage keys
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('onesignal') || key.includes('OneSignal'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('[Cleanup] Removing localStorage key:', key);
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('[Cleanup] localStorage cleanup failed:', error);
    }

    // 3. Clear sessionStorage keys
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('onesignal') || key.includes('OneSignal'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('[Cleanup] Removing sessionStorage key:', key);
        sessionStorage.removeItem(key);
      });
    } catch (error) {
      console.error('[Cleanup] sessionStorage cleanup failed:', error);
    }

    // 4. Unregister service workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          const scriptURL = registration.active?.scriptURL || '';
          if (scriptURL.includes('OneSignal') || scriptURL.includes('onesignal')) {
            console.log('[Cleanup] Unregistering service worker:', scriptURL);
            await registration.unregister();
          }
        }
      } catch (error) {
        console.error('[Cleanup] Service worker cleanup failed:', error);
      }
    }

    // 5. Clear cache storage
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          if (cacheName.includes('onesignal') || cacheName.includes('OneSignal')) {
            console.log('[Cleanup] Deleting cache:', cacheName);
            await caches.delete(cacheName);
          }
        }
      } catch (error) {
        console.error('[Cleanup] Cache cleanup failed:', error);
      }
    }

    console.log('[Cleanup] ✅ OneSignal data cleanup complete!');
    console.log('[Cleanup] Please refresh the page for changes to take effect.');

  } catch (error) {
    console.error('[Cleanup] Cleanup failed:', error);
    throw error;
  }
}

/**
 * Export cleanup function to window for easy access from browser console
 */
if (typeof window !== 'undefined') {
  (window as any).clearOneSignalData = clearOneSignalData;
}

/**
 * Get current OneSignal storage state (for debugging)
 */
export async function getOneSignalStorageState(): Promise<{
  indexedDB: string[];
  localStorage: string[];
  sessionStorage: string[];
  serviceWorkers: string[];
  caches: string[];
}> {
  const state = {
    indexedDB: [] as string[],
    localStorage: [] as string[],
    sessionStorage: [] as string[],
    serviceWorkers: [] as string[],
    caches: [] as string[],
  };

  // Check IndexedDB
  if ('indexedDB' in window) {
    try {
      const databases = await window.indexedDB.databases();
      state.indexedDB = databases
        .filter(db => db.name?.includes('OneSignal') || db.name?.includes('onesignal'))
        .map(db => db.name || '');
    } catch (error) {
      console.error('IndexedDB check failed:', error);
    }
  }

  // Check localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('onesignal') || key.includes('OneSignal'))) {
        state.localStorage.push(key);
      }
    }
  } catch (error) {
    console.error('localStorage check failed:', error);
  }

  // Check sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.includes('onesignal') || key.includes('OneSignal'))) {
        state.sessionStorage.push(key);
      }
    }
  } catch (error) {
    console.error('sessionStorage check failed:', error);
  }

  // Check service workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      state.serviceWorkers = registrations
        .filter(reg => {
          const scriptURL = reg.active?.scriptURL || '';
          return scriptURL.includes('OneSignal') || scriptURL.includes('onesignal');
        })
        .map(reg => reg.active?.scriptURL || '');
    } catch (error) {
      console.error('Service worker check failed:', error);
    }
  }

  // Check caches
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      state.caches = cacheNames.filter(
        name => name.includes('onesignal') || name.includes('OneSignal')
      );
    } catch (error) {
      console.error('Cache check failed:', error);
    }
  }

  return state;
}

// Export to window for console access
if (typeof window !== 'undefined') {
  (window as any).getOneSignalStorageState = getOneSignalStorageState;
}
