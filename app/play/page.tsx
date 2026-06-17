import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlayClient from "./PlayClient";

export default async function PlayPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="relative flex flex-1 bg-black text-white">
      <PlayClient />
      <Link
        href="/office"
        className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-lg border border-amber-400/40 bg-black/70 px-3 py-2 font-mono text-xs text-amber-300 backdrop-blur transition hover:bg-black/90"
      >
        🎨 Oficina nueva →
      </Link>
    </main>
  );
}
