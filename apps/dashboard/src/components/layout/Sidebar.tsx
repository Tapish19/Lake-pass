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
  { href: '/team',        label: 'Team',         icon: '👥' },
  { href: '/settings',    label: 'Settings',     icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-100">
        <span className="text-xl font-bold text-brand-700">Lake Pass</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
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
  );
}
