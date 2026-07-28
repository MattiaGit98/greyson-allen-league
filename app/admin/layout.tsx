import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=Supabase-non-configurato");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (!membership) redirect("/login?error=Account-non-autorizzato");
  return (
    <>
      <div className="admin-session-bar">
        <span>Area admin · {user.email}</span>
        <div><Link href="/admin">Dashboard</Link><Link href="/admin/operazioni">Operazioni</Link><Link href="/admin/impostazioni">Fase</Link><form action={logout}><button type="submit">Esci</button></form></div>
      </div>
      {children}
    </>
  );
}
