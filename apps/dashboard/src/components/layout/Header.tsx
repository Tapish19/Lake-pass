'use client';

import { UserButton } from '@clerk/nextjs';

export default function Header() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div />
      <UserButton afterSignOutUrl="/login" />
    </header>
  );
}
