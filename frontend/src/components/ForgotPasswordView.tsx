import { useState } from "react";
import { ArrowLeft, KeyRound, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Props = { onBack: () => void };
type Step = "check" | "otp" | "new-password" | "complete";

export default function ForgotPasswordView({ onBack }: Props) {
  const [step, setStep] = useState<Step>("check");
  const [email, setEmail] = useState("");
  const [lastPassword, setLastPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const field =
    "w-full rounded-md border border-input bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-ring";

  async function checkPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.forgotPassword(email, lastPassword);
      if (response.message.toLowerCase().includes("correct")) {
        setNotice(response.message);
      } else {
        setNotice(response.message);
        setStep("otp");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password recovery failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.verifyForgotPasswordOtp(email, otp);
      if (!response.message.toLowerCase().includes("new password")) {
        throw new Error(response.message || "Wrong OTP");
      }
      setStep("new-password");
      setNotice(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.resetPassword(email, newPassword);
      if (!response.message.toLowerCase().includes("success")) {
        throw new Error(response.message || "Password reset failed");
      }
      setStep("complete");
      setNotice(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
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
            <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>
            <p className="text-xs text-muted-foreground">Tourist Safety Tracker account recovery</p>
          </div>
        </div>

        {step === "check" && (
          <form onSubmit={checkPassword} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the last password you remember. If it is not correct, we will send an OTP to verify your account.
            </p>
            <input className={field} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <input className={field} type="password" required value={lastPassword} onChange={(event) => setLastPassword(event.target.value)} placeholder="Last password you remember" />
            <SubmitButton busy={busy} label="Check password" icon={<KeyRound className="size-4" />} />
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">We sent an OTP to {email}. Enter it to continue.</p>
            <input className={`${field} text-center font-mono text-lg tracking-[0.4em]`} required value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="000000" />
            <SubmitButton busy={busy} label="Verify OTP" icon={<MailCheck className="size-4" />} />
          </form>
        )}

        {step === "new-password" && (
          <form onSubmit={resetPassword} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">OTP verified. Choose a new password.</p>
            <input className={field} type="password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" />
            <input className={field} type="password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" />
            <SubmitButton busy={busy} label="Reset password" icon={<KeyRound className="size-4" />} />
          </form>
        )}

        {step === "complete" && (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">{notice}</p>
            <Button type="button" onClick={onBack} className="w-full">Return to sign in</Button>
          </div>
        )}

        {error && <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">{error}</p>}
        {notice && step !== "complete" && <p className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">{notice}</p>}

        {step !== "complete" && (
          <Button type="button" variant="link" onClick={onBack} className="mt-4 w-full text-xs text-muted-foreground">
            <ArrowLeft className="size-3.5" /> Back to sign in
          </Button>
        )}
      </div>
    </div>
  );
}

function SubmitButton({ busy, label, icon }: { busy: boolean; label: string; icon: React.ReactNode }) {
  return (
    <Button type="submit" disabled={busy} className="mt-2 h-10 w-full shadow-(--shadow-glow-purple)">
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {busy ? "Please wait…" : label}
    </Button>
  );
}
