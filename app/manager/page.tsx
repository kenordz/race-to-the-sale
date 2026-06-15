import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ManagerDashboard from "./ManagerDashboard";

// The accountability screen — what the dealer principal/GM actually buys.
// Read-only, sober, no pixel art: the game is for reps, THIS is for the
// person who signs the check. Manager/admin only.
export default async function ManagerPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, dealership_id")
    .eq("id", user.id)
    .single();

  const isManager = profile?.role === "manager" || profile?.role === "admin";
  if (!isManager) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
        <h1 className="text-2xl font-bold">Manager Dashboard</h1>
        <p className="max-w-sm text-sm text-white/50">
          Esta vista es solo para managers. Tu rol:{" "}
          <span className="text-white/80">{profile?.role ?? "—"}</span>
        </p>
        <Link href="/dashboard" className="text-sm text-white/60 underline">
          ← Volver
        </Link>
      </main>
    );
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("name")
    .eq("id", profile!.dealership_id!)
    .single();

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              Race to the Sale · Manager
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {dealership?.name ?? "Dealership"}
            </h1>
          </div>
          <nav className="flex gap-4 text-sm text-white/50">
            <Link href="/demo" className="underline hover:text-white">
              Demo Director
            </Link>
            <Link href="/play" className="underline hover:text-white">
              Juego
            </Link>
          </nav>
        </header>
        <ManagerDashboard />
      </div>
    </main>
  );
}
