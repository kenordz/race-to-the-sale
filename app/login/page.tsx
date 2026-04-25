import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-black px-4 text-white">
      <form className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-8 shadow-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Race to the Sale</h1>
          <p className="mt-1 text-sm text-white/50">
            Sign in to your dealership.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            name="email"
            type="email"
            placeholder="Email"
            autoComplete="email"
            required
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            minLength={6}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            formAction={login}
            className="flex-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Sign in
          </button>
          <button
            formAction={signup}
            className="flex-1 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}
