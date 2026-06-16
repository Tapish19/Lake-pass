'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { authedRequest } from '@/lib/api';

export default function AccountSync() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isSignedIn || !user) return;
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;

    getToken().then((token) => {
      if (!token) return;
      return authedRequest('/auth/sync', token, {
        method: 'POST',
        body: JSON.stringify({
          name: user.fullName ?? user.firstName ?? 'Lake Pass guest',
          email,
          phone: user.primaryPhoneNumber?.phoneNumber,
        }),
      });
    }).catch(() => undefined);
  }, [getToken, isSignedIn, user]);

  return null;
}
