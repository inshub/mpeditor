import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";
import "./App.css";
import "./i18n";
import App from "./App";

function AppWrapper() {
  useEffect(() => {
    if ("__TAURI_INTERNALS__" in window) {
      getCurrentWindow().show();
    }
  }, []);

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppWrapper />
  </StrictMode>
);
