import { redirect } from "next/navigation";
import { login } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect("/admin");
  const query = await searchParams;
  return (
    <section className="login-page">
      <div className="login-copy">
        <p className="eyebrow">Area riservata</p>
        <h1>Amministrazione</h1>
      </div>
      <form action={login} className="login-card">
        <h2>Accedi</h2>
        {query.error && <p className="notice error">{query.error.replaceAll("-", " ")}</p>}
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <button className="button primary" type="submit">Entra nell’area admin</button>
      </form>
    </section>
  );
}
