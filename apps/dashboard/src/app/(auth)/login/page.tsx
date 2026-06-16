import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-900">Lake Pass</h1>
          <p className="text-gray-500 mt-1">Marina Dashboard</p>
        </div>
        <SignIn redirectUrl="/fleet" />
      </div>
    </main>
  );
}
