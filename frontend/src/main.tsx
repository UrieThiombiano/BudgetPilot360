import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { applyStoredTheme } from "./hooks/useTheme";
// Polices auto-hébergées (aucune requête externe) : Inter pour le corps,
// Space Grotesk pour l'affichage (titres + montants).
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./index.css";

// Appliquer le thème avant le premier rendu pour éviter un flash clair/sombre.
applyStoredTheme();

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" : désactive les animations si l'OS le demande (a11y) */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>
);
