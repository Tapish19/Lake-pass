'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useMemo } from 'react';
import { authedRequest } from '@/lib/api';

const SYNC_STORAGE_PREFIX = 'lake-pass:account-sync:';

export default function AccountSync() {
  const { isSignedIn, getToken } = useAuth();
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

    getToken().then((token) => {
      if (!token) return;
      return authedRequest('/auth/sync', token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          phone,
        }),
      });
    })
      .then(() => sessionStorage.setItem(syncKey, 'complete'))
      .catch(() => sessionStorage.removeItem(syncKey));
  }, [email, getToken, isSignedIn, name, phone, syncKey]);

  return null;
}
