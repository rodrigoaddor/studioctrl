import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { StudioProvider } from "./context";
import { PwaUpdate } from "./components/pwa-update";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <StudioProvider>
        <App />
        <PwaUpdate />
      </StudioProvider>
    </BrowserRouter>
  </StrictMode>,
);
