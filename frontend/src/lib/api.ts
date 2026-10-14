import type {
  DetectionResponse,
  GeofencePingRequest,
  GeofencePingResponse,
  Profile,
  TrackPoint,
} from "./trajectory-types";

export const API_BASE =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:8000";

const TOKEN_KEY = "authToken";
const LEGACY_TOKEN_KEY = "tst_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) return token;
  const legacyToken = window.localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken) {
    window.localStorage.setItem(TOKEN_KEY, legacyToken);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  return legacyToken;
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error("Not authenticated");
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Cannot reach the backend at ${API_BASE}`);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail =
      (body as { detail?: string; message?: string } | null)?.detail ??
      (body as { message?: string } | null)?.message ??
      `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }

  return body as T;
}

export const api = {
  register: (email: string, password: string, role: string) =>
    request<{ message: string; status: boolean }>("/registration", {
      method: "POST",
      body: JSON.stringify({ email, password, role }),
    }),

  verifyOtp: (email: string, otp: string) =>
    request<{ status: boolean }>("/registration/enter_otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; verified: boolean }>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  profile: () =>
    request<{ current_user: Profile }>("/profile", { method: "GET" }, true).then(
      (r) => r.current_user,
    ),

  removeAccount: (email: string, password: string, role: string) =>
    request<{ message: string; status: boolean }>("/remove-account", {
      method: "POST",
      body: JSON.stringify({ email, password, role }),
    }),

  forgotPassword: (email: string, password: string) =>
    request<{ message: string }>("/forgot_password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  verifyForgotPasswordOtp: (email: string, otp: string) =>
    request<{ message: string }>("/forgot_password/enter_otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    }),

  resetPassword: (email: string, password: string) =>
    request<{ message: string }>("/forgot_password/enter_new_password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  sendSamples: (samples: TrackPoint[]) =>
    request<DetectionResponse>(
      "/location_data",
      { method: "POST", body: JSON.stringify({ samples }) },
      true,
    ),

  sendGeofencePing: (data: GeofencePingRequest) =>
    request<GeofencePingResponse>(
      "/geofence_ping",
      { method: "POST", body: JSON.stringify(data) },
      true,
    ),
};
