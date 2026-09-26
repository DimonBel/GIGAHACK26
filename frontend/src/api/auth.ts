import { request } from "./client";
import type { User } from "./types";

export const login = (email: string, password: string) =>
  request<User>("POST", "/auth/login", { email, password }, { quiet401: true });

/** The signed-in user after a reload; rejects with 401 when there is no session. */
export const me = () => request<User>("GET", "/auth/me", undefined, { quiet401: true });

export const logout = () => request<void>("POST", "/auth/logout");
