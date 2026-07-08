import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import Providers from './providers';
import ServiceWorkerRegister from '@/components/reservations/ServiceWorkerRegister';
import OfflineIndicator from '@/components/reservations/OfflineIndicator';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lake Pass — Marina Dashboard',
  description: 'Marina fleet and reservation management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <ServiceWorkerRegister />
          <Providers>{children}</Providers>
          <OfflineIndicator />
        </body>
      </html>
    </ClerkProvider>
  );
}
