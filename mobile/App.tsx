import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useOneSignal } from './hooks/useOneSignal';

const API_BASE_URL = 'https://www.roster-app.com';

interface User {
  id: number;
  displayId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { 
    isInitialized, 
    playerId, 
    externalIdSet, 
    permissionGranted, 
    login, 
    requestPermission,
    getPlayerId 
  } = useOneSignal();
  const [registeredWithBackend, setRegisteredWithBackend] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (isInitialized && user?.displayId && !registeredWithBackend && permissionGranted) {
      syncExternalId();
    }
  }, [isInitialized, user, registeredWithBackend, permissionGranted]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        console.log('[App] User authenticated:', userData.displayId);
      } else {
        console.log('[App] User not authenticated');
        setUser(null);
      }
    } catch (error) {
      console.error('[App] Auth check error:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const syncExternalId = async () => {
    if (!user?.displayId) {
      console.warn('[App] Cannot sync External ID - no displayId');
      return;
    }

    try {
      console.log('[App] Syncing External ID:', user.displayId);
      
      await login(user.displayId);
      
      const currentPlayerId = await getPlayerId();
      console.log('[App] Got player ID:', currentPlayerId);
      
      if (currentPlayerId) {
        console.log('[App] Registering player ID with backend...');
        const registerResponse = await fetch(`${API_BASE_URL}/api/notifications/register-onesignal`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: currentPlayerId }),
        });
        console.log('[App] Register response:', registerResponse.status);
        
        console.log('[App] Linking external ID with backend...');
        const linkResponse = await fetch(`${API_BASE_URL}/api/notifications/link-external-id`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oneSignalId: currentPlayerId,
            userId: user.displayId,
          }),
        });
        console.log('[App] Link response:', linkResponse.status);
        
        if (registerResponse.ok && linkResponse.ok) {
          setRegisteredWithBackend(true);
          console.log('[App] Successfully registered with backend');
        } else {
          console.error('[App] Backend registration failed');
        }
      } else {
        console.warn('[App] No player ID available - cannot register with backend');
      }
    } catch (error) {
      console.error('[App] External ID sync error:', error);
    }
  };

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (granted) {
      Alert.alert('Success', 'Push notifications enabled!');
      if (user?.displayId) {
        await syncExternalId();
      }
    } else {
      Alert.alert('Denied', 'Push notification permission was denied');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Loading...</Text>
        <StatusBar style="light" backgroundColor="#000000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Roster App</Text>
      
      <View style={styles.statusCard}>
        <Text style={styles.sectionTitle}>User Status</Text>
        {user ? (
          <>
            <Text style={styles.statusText}>Logged in as: {user.firstName} {user.lastName}</Text>
            <Text style={styles.statusText}>Display ID: {user.displayId}</Text>
          </>
        ) : (
          <Text style={styles.statusText}>Not logged in</Text>
        )}
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <Text style={styles.statusText}>
          OneSignal: {isInitialized ? '✅ Initialized' : '❌ Not initialized'}
        </Text>
        <Text style={styles.statusText}>
          Permission: {permissionGranted ? '✅ Granted' : '❌ Not granted'}
        </Text>
        <Text style={styles.statusText}>
          Player ID: {playerId ? playerId.substring(0, 8) + '...' : 'None'}
        </Text>
        <Text style={styles.statusText}>
          External ID: {externalIdSet ? `✅ ${user?.displayId}` : '❌ Not set'}
        </Text>
        <Text style={styles.statusText}>
          Backend Registered: {registeredWithBackend ? '✅ Yes' : '❌ No'}
        </Text>
      </View>

      {!permissionGranted && (
        <TouchableOpacity style={styles.button} onPress={handleRequestPermission}>
          <Text style={styles.buttonText}>Enable Push Notifications</Text>
        </TouchableOpacity>
      )}

      {user && !registeredWithBackend && isInitialized && permissionGranted && (
        <TouchableOpacity style={styles.button} onPress={syncExternalId}>
          <Text style={styles.buttonText}>Register with Backend</Text>
        </TouchableOpacity>
      )}

      <StatusBar style="light" backgroundColor="#000000" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  button: {
    backgroundColor: '#0066cc',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    marginTop: 16,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
});
