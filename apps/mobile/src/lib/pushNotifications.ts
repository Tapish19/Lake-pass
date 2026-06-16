/**
 * Expo push notification registration.
 * Call registerForPushNotifications() once after sign-in.
 * The returned token is sent to the API so the backend can send
 * targeted notifications (booking confirmations, reminders, weather alerts).
 *
 * Requires:  expo install expo-notifications expo-device
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Push] Physical device required for push notifications');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:       'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log('[Push] Token:', token);
  return token;
}

/** Send push via Expo Push API (server-side alternative — kept here for reference) */
export async function sendPushNotification(expoPushToken: string, title: string, body: string, data?: object) {
  const message = { to: expoPushToken, sound: 'default', title, body, data };
  await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
    body:    JSON.stringify(message),
  });
}
