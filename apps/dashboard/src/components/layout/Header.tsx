// path: apps/dashboard/src/components/layout/Header.tsx

'use client';

import { UserButton } from '@clerk/nextjs';

type HeaderProps = {
  onMenuClick: () => void;
};

export default function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
      <button
        type="button"
        className="lg:hidden text-gray-500 hover:text-gray-700 p-2 -ml-2"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <span className="text-xl">☰</span>
      </button>
      <div className="hidden lg:block" />
      <UserButton afterSignOutUrl="/login" />
    </header>
  );
}
