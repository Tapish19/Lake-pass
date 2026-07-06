declare const process: {
  env: Record<string, string | undefined>;
};

declare module 'expo-network' {
  export function getNetworkStateAsync(): Promise<{
    isConnected?: boolean | null;
    isInternetReachable?: boolean | null;
  }>;
}

declare module 'expo-device' {
  export const isDevice: boolean;
}


declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  export default AsyncStorage;
}
