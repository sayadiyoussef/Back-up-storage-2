// client/src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Attend DOM, polices (si supporté), 2 RAF, ET met un timeout de secours.
// Rejoue au retour d’onglet si l’onglet était en arrière-plan (RAF throttling).
async function waitForStableStyles(maxWaitMs = 1200) {
  const start = performance.now();

  // DOM prêt
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) =>
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
    );
  }

  // Polices prêtes (si supporté) mais sans bloquer trop longtemps
  try {
    // @ts-ignore
    if (document.fonts?.ready) {
      await Promise.race([
        // @ts-ignore
        (document as any).fonts.ready,
        new Promise<void>((r) => setTimeout(r, Math.max(0, maxWaitMs - (performance.now() - start)))),
      ]);
    }
  } catch {/* no-op */}

  // 2 frames de marge (applique les CSS)
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  // Si la page était cachée (onglet en arrière-plan), on rejoue une frame au retour
  if (document.visibilityState === "hidden") {
    await new Promise<void>((resolve) => {
      const onVisible = () => {
        document.removeEventListener("visibilitychange", onVisible);
        requestAnimationFrame(() => resolve());
      };
      document.addEventListener("visibilitychange", onVisible);
    });
  }
}

// sécurise #root présent
let rootEl = document.getElementById("root");
if (!rootEl) {
  rootEl = document.createElement("div");
  rootEl.id = "root";
  document.body.appendChild(rootEl);
}

const root = createRoot(rootEl);

(async () => {
  try {
    await waitForStableStyles();
  } catch {/* on rend quand même */}
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
})();
