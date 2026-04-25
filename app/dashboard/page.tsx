import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function DashboardPage() {
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

  const greetingName = profile?.full_name ?? user.email ?? "there";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-black px-4 text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-white/40">
          Race to the Sale
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Hello, {greetingName}
        </h1>
        <p className="mt-3 text-white/50">
          Role: <span className="text-white/80">{profile?.role ?? "—"}</span>
          {" · "}
          Dealership:{" "}
          <span className="text-white/80">
            {profile?.dealership_id ?? "unassigned"}
          </span>
        </p>
        <p className="mt-6 max-w-md text-sm text-white/40">
          The race track is coming next session. For now this confirms auth +
          DB are wired up end-to-end.
        </p>
      </div>

      <form action={signOut}>
        <button className="rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10">
          Sign out
        </button>
      </form>
    </main>
  );
}
