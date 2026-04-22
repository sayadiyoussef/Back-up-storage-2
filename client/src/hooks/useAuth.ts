import { useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}
interface AuthData {
  user: User;
  token: string;
}

// Normalise n'importe quel shape vers { user, token }
function normalizeAuthShape(raw: any): AuthData | null {
  if (!raw) return null;

  // { data: { user, token } }
  if (raw.data && raw.data.user && raw.data.token) {
    return { user: raw.data.user, token: raw.data.token };
  }
  // { user, token }
  if (raw.user && raw.token) {
    return { user: raw.user, token: raw.token };
  }
  return null;
}

// petit helper fetch avec timeout pour éviter les hangs
async function fetchJSONWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = 10000
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(input, { ...init, signal: controller.signal });
    const text = await resp.text(); // supporte les erreurs non-JSON
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text || "" };
    }
    return { resp, json };
  } finally {
    clearTimeout(id);
  }
}

export function useAuth() {
  const [authData, setAuthData] = useState<AuthData | null>(() => {
    const stored = localStorage.getItem("auth");
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      return normalizeAuthShape(parsed);
    } catch {
      return null;
    }
  });

  const login = async (email: string, password: string): Promise<void> => {
    const { resp, json } = await fetchJSONWithTimeout("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!resp.ok) {
      const msg =
        (json && json.message) ||
        `Login failed (HTTP ${resp.status})`;
      throw new Error(msg);
    }

    const normalized =
      normalizeAuthShape(json) || normalizeAuthShape(json?.data);
    if (!normalized) {
      throw new Error("Invalid auth response shape");
    }

    setAuthData(normalized);
    // On enregistre désormais au format stable { user, token }
    localStorage.setItem("auth", JSON.stringify(normalized));
  };

  const logout = () => {
    setAuthData(null);
    localStorage.removeItem("auth");
  };

  return {
    user: authData?.user ?? null,
    token: authData?.token ?? null,
    isAuthenticated: !!authData,
    login,
    logout,
  };
}
