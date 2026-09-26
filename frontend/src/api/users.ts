import { request } from "./client";
import type { User } from "./types";

/** The hospital directory (moderators), to choose who attended a meeting. */
export const listUsers = () => request<User[]>("GET", "/users");
