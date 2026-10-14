import { useState } from "react";
import { KeyRound, Loader2, MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AuthView({
  onAuthed,
  onForgotPassword,
}: {
  onAuthed: () => void;
  onForgotPassword: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("tourist");
  const [otp, setOtp] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const field =
    "w-full rounded-md border border-input bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-ring";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "register") {
        const res = await api.register(email, password, role);
        setNotice(res.message || "Verification code sent to your email.");
        setOtpOpen(true);
      } else {
        const res = await api.login(email, password);
        setToken(res.token);
        if (!res.verified) setNotice("Account not verified yet — verify to enable tracking.");
        onAuthed();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp(email, otp);
      if (!res.status) throw new Error("Invalid verification code");
      setOtpOpen(false);
      setMode("login");
      setNotice("Email verified. You can sign in now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-grid flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-7 shadow-(--shadow-panel)">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md border border-primary/30 bg-primary/15 text-primary shadow-(--shadow-glow-purple)">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Tourist Safety Tracker</h1>
            <p className="text-xs text-muted-foreground">
              Real-time trajectory anomaly monitoring
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-md border border-border bg-secondary p-1 text-sm">
          {(["login", "register"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              variant="ghost"
              className={`h-9 rounded-sm px-3 py-2 font-medium capitalize transition ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}
            </Button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              className={field}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <input
              className={field}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {mode === "register" && (
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="tourist">tourist</option>
                <option value="authority">authority</option>
                <option value="admin">admin</option>
              </select>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              {notice}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="mt-2 h-10 w-full shadow-(--shadow-glow-purple)"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "login" ? (
              <KeyRound className="size-4" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {mode === "login" && (
          <Button
            type="button"
            onClick={onForgotPassword}
            variant="link"
            className="mt-3 w-full text-xs text-muted-foreground"
          >
            Forgot password?
          </Button>
        )}

        {mode === "register" && !otpOpen && (
          <Button
            type="button"
            onClick={() => setOtpOpen(true)}
            variant="link"
            className="mt-3 w-full text-xs text-muted-foreground"
          >
            Already have a code? Verify email
          </Button>
        )}
      </div>

      {otpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
          <div className="panel w-full max-w-sm p-6 shadow-(--shadow-panel)">
            <div className="flex items-center gap-2 text-primary">
              <MailCheck className="size-5" />
              <h2 className="text-base font-semibold text-foreground">Verify your email</h2>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Enter the 6-digit code sent to {email || "your email"}.
            </p>
            <input
              className={`${field} mt-4 text-center font-mono text-lg tracking-[0.4em]`}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="000000"
            />
            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
            <div className="mt-5 flex gap-2">
              <Button
                onClick={() => setOtpOpen(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmOtp}
                disabled={busy || otp.length < 4}
                className="flex-1"
              >
                {busy ? "Verifying…" : "Verify"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
