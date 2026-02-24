"use client";

export type AppUser = {
  id: string;
  name: string;
  email: string;
};

const USER_KEY = "nc_user_v1";
const MESH_KEY = "nc_mesh_v1";

export function getStoredUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AppUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_KEY);
}

export function getMeshEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MESH_KEY) === "1";
}

export function setMeshEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MESH_KEY, enabled ? "1" : "0");
}
