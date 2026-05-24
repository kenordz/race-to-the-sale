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
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-black px-4 py-8 text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-white/40">
          Race to the Sale
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">The Office</h1>
        <p className="mt-1 text-xs text-white/40">
          Move with arrow keys. More to come.
        </p>
      </div>

      <PlayClient />
    </main>
  );
}
