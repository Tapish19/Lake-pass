import * as SecureStore from 'expo-secure-store';

// Clerk Expo persists session tokens via a "token cache". expo-secure-store
// keeps these encrypted on-device between app launches.
export const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore write failures (e.g. unsupported on web)
    }
  },
};
