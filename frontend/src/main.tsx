import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { useSessionStore } from "@/stores/session";

import { App } from "./App";
import "./styles/index.css";

// Still signed in from a previous visit? (the session cookie) — the guards wait for the answer.
void useSessionStore.getState().restore();

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing in index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
