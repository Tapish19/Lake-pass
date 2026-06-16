import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import Header from '@/components/Header';
import AccountSync from '@/components/AccountSync';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lake Pass | Your day on the water starts here',
  description: 'Find and book trusted boat rentals from great local marinas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const content = (
    <html lang="en">
      <body>
        {clerkEnabled && <AccountSync />}
        <Header />
        {children}
      </body>
    </html>
  );

  if (!clerkEnabled) return content;

  return (
    <ClerkProvider>
      {content}
    </ClerkProvider>
  );
}
