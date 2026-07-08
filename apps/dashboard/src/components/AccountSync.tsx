'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { useApi } from '@/lib/useApi';

/**
 * Ensures every dashboard sign-in has a matching Lake Pass User row, even
 * before a marina owner grants that person a staff role.
 */
export default function AccountSync() {
  const api = useApi();
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isSignedIn || !user) return;

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;

    api.post('/auth/sync', {
      name:  user.fullName ?? user.firstName ?? 'Lake Pass guest',
      email,
      phone: user.primaryPhoneNumber?.phoneNumber,
    }).catch(() => undefined);
  }, [api, isSignedIn, user]);

  return null;
}
