'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { MenuIcon } from './Icons';

export default function Header() {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <Link href="/" className="brand" aria-label="Lake Pass home">
          <span className="brand-mark"><span /></span>
          <span>Lake Pass</span>
        </Link>
        <nav className="nav-links" aria-label="Primary navigation">
          <Link href="/boats">Find a boat</Link>
          <Link href="/trips">My trips</Link>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="nav-actions">
          {clerkEnabled ? (
            <>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="text-button">Sign in</button>
                </SignInButton>
                <SignInButton mode="modal">
                  <button className="button button-dark button-small">Get started</button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link href="/trips" className="text-button">My trips</Link>
                <UserButton />
              </SignedIn>
            </>
          ) : (
            <Link href="/boats" className="button button-dark button-small">Explore boats</Link>
          )}
          <button className="menu-button" aria-label="Open menu"><MenuIcon /></button>
        </div>
      </div>
    </header>
  );
}
