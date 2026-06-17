import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DemoControls from "./DemoControls";

// Demo Director panel — Sergio opens this on his PHONE while the prospect
// watches the game on the big screen. Manager/admin only.
export default async function DemoPage() {
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
        <p className="text-sm uppercase tracking-widest text-white/40">
          Race to the Sale
        </p>
        <h1 className="text-2xl font-bold">Demo Director</h1>
        <p className="max-w-sm text-sm text-white/50">
          Este panel es solo para managers. Tu rol actual:{" "}
          <span className="text-white/80">{profile?.role ?? "—"}</span>. Pide a
          un admin que actualice tu perfil.
        </p>
        <Link href="/dashboard" className="text-sm text-white/60 underline">
          ← Volver al dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="bg-brand-arena min-h-screen px-4 py-8 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-amber-300/70">
            🏁 Race to the Sale
          </p>
          <h1 className="mt-1 text-2xl font-bold">🎬 Demo Director</h1>
          <p className="mt-1 text-sm text-white/50">
            Controla el demo en vivo: inyecta leads, abre robos, resetea.
          </p>
        </header>
        <DemoControls />
        <Link href="/play" className="text-center text-sm text-white/40 underline">
          Abrir el juego →
        </Link>
      </div>
    </main>
  );
}
