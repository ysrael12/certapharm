import { redirect } from "next/navigation";
import { isManager, managerEnabled } from "@/lib/manager-auth";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certapharm Manager · Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isManager()) redirect("/manager");
  const sp = await searchParams;
  const enabled = managerEnabled();
  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 26 }}>Certapharm Manager</h1>
      <p className="muted">Sign in with the manager token to register participants, batches, custody events and alerts on devnet.</p>
      {!enabled ? (
        <p className="strip warn" role="alert">The manager is switched off. Set MANAGER_TOKEN in the environment to turn it on.</p>
      ) : (
        <form action={signIn} className="panel" style={{ padding: 16, gap: 16 }}>
          <div className="field">
            <label htmlFor="token">Manager token</label>
            <input id="token" name="token" type="password" autoComplete="current-password" required aria-invalid={sp.error ? true : undefined} aria-describedby={sp.error ? "err" : undefined} />
            {sp.error && <span id="err" role="alert" className="hint">That token is not right. Check it and try again.</span>}
          </div>
          <div className="actions"><button className="btn primary" type="submit">Sign in</button></div>
        </form>
      )}
    </main>
  );
}
