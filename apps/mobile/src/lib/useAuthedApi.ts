import { useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-expo';

/**
 * Returns an axios instance pointed at the Lake Pass API that attaches the
 * current Clerk session token as a Bearer token. Use this for any
 * authenticated request (booking, reservations, payments, profile).
 */
export function useAuthedApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    const api = axios.create({
      baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api',
      timeout: 10000,
    });

    api.interceptors.request.use(async (config) => {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    return api;
  }, [getToken]);
}
