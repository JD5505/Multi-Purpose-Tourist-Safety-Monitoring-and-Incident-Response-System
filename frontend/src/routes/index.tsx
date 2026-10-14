import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import AuthView from "@/components/AuthView";
import Dashboard from "@/components/Dashboard";
import ForgotPasswordView from "@/components/ForgotPasswordView";
import { api, clearToken, getToken } from "@/lib/api";
import type { Profile } from "@/lib/trajectory-types";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tourist Safety Tracker — Live Trajectory Anomaly Detection" },
      {
        name: "description",
        content:
          "Monitor live GPS trajectories in real time and detect movement anomalies with reconstruction-error scoring.",
      },
      { property: "og:title", content: "Tourist Safety Tracker" },
      {
        property: "og:description",
        content: "Real-time GPS trajectory anomaly detection dashboard with live map and metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!getToken()) {
      setAuthed(false);
      setReady(true);
      return;
    }
    try {
      setProfile(await api.profile());
      setAuthed(true);
    } catch {
      clearToken();
      setAuthed(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const logout = () => {
    clearToken();
    setProfile(null);
    setAuthed(false);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground">
        Initializing telemetry…
      </div>
    );
  }

  if (!authed) {
    if (showForgotPassword) {
      return <ForgotPasswordView onBack={() => setShowForgotPassword(false)} />;
    }
    return (
      <AuthView
        onForgotPassword={() => setShowForgotPassword(true)}
        onAuthed={() => {
          setReady(false);
          void loadProfile();
        }}
      />
    );
  }

  return <Dashboard profile={profile} onLogout={logout} />;
}
