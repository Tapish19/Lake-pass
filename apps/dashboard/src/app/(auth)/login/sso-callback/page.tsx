import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

/**
 * Required by Clerk for social/SSO sign-in (Google, etc.) to work.
 *
 * <SignIn /> on the login page renders social login buttons whenever a
 * social connection is enabled in the Clerk dashboard. After the user
 * completes auth with the provider, Clerk redirects the browser back here
 * to finish the flow (exchange the OAuth code, establish the session, then
 * forward on to the originally requested redirect_url). Without this route,
 * that redirect 404s and the user is stuck mid-login.
 */
export default function SsoCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
