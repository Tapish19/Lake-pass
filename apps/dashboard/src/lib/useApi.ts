'use client';

import { useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';

/**
 * Returns an axios instance pointed at the Lake Pass API that automatically
 * attaches the current Clerk session token as a Bearer token. Use this from
 * client components for any authenticated request (fleet, reservations,
 * payments, etc).
 */
export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    const api = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api',
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
