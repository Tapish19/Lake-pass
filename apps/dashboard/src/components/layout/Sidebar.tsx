// path: apps/dashboard/src/components/layout/Sidebar.tsx

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const nav = [
  { href: '/fleet',       label: 'Fleet',        icon: '⛵' },
  { href: '/reservations',label: 'Reservations', icon: '📅' },
  { href: '/payments',    label: 'Payments',     icon: '💳' },
  { href: '/maintenance', label: 'Maintenance',  icon: '🔧' },
  { href: '/reports',     label: 'Reports',      icon: '📊' },
  { href: '/copilot',     label: 'AI Copilot',   icon: '✨' },
  { href: '/team',        label: 'Team',         icon: '👥' },
  { href: '/settings',    label: 'Settings',     icon: '⚙️' },
];

type SidebarProps = {
  /** Only used below the lg breakpoint — desktop sidebar is always visible. */
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop — tapping it closes the drawer. Desktop never renders this. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'w-60 bg-white border-r border-gray-200 flex flex-col',
          // Mobile: fixed, full-height slide-in drawer, hidden off-screen by default.
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: back to a normal static column, always visible.
          'lg:static lg:translate-x-0 lg:z-auto'
        )}
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xl font-bold text-brand-700">Lake Pass</span>
          <button
            type="button"
            className="lg:hidden text-gray-400 hover:text-gray-600"
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {nav.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
