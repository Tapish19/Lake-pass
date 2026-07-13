'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useMemo } from 'react';
import { useApi } from '@/lib/useApi';

const SYNC_STORAGE_PREFIX = 'lake-pass:dashboard-account-sync:';

/**
 * Ensures every dashboard sign-in has a matching Lake Pass User row, even
 * before a marina owner grants that person a staff role.
 */
export default function AccountSync() {
  const api = useApi();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const phone = user?.primaryPhoneNumber?.phoneNumber;
  const name = user?.fullName ?? user?.firstName ?? 'Lake Pass guest';
  const syncKey = useMemo(() => {
    if (!user?.id || !email) return null;
    return `${SYNC_STORAGE_PREFIX}${user.id}:${email}:${name}:${phone ?? ''}`;
  }, [email, name, phone, user?.id]);

  useEffect(() => {
    if (!isSignedIn || !email || !syncKey) return;

    if (sessionStorage.getItem(syncKey)) return;
    sessionStorage.setItem(syncKey, 'pending');

    api.post('/auth/sync', {
      name,
      email,
      phone,
    })
      .then(() => sessionStorage.setItem(syncKey, 'complete'))
      .catch(() => sessionStorage.removeItem(syncKey));
  }, [api, email, isSignedIn, name, phone, syncKey]);

  return null;
}
