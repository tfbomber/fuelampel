import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Checks and optionally requests notification permissions.
 * Safe to call at any time. Automatically handles OS-specific behavior.
 * 
 * @returns true if permission is granted, false otherwise.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    
    if (status === 'granted') {
      return true;
    }
    
    if (canAskAgain) {
      console.log('[NotifPerm] Status is not granted, requesting permission...');
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      
      if (newStatus === 'granted') {
        console.log('[NotifPerm] Permission granted via prompt.');
        return true;
      }
    }
    
    console.warn('[NotifPerm] Permission denied or cannot ask again. User must enable in OS settings.');
    return false;
  } catch (error) {
    console.warn('[NotifPerm] Error checking/requesting permission:', error);
    return false;
  }
}
