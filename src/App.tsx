import { Cast, Circle, LogOut, X } from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Button } from "./components/ui/button";
import { useStudio } from "./context";
import { Connections } from "./pages/connections";
import { Studio } from "./pages/studio";
export default function App() {
  const { client, status, error } = useStudio();
  const navigate = useNavigate();
  function exit() {
    client.disconnect();
    navigate("/", { replace: true });
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to={status === "connected" ? "/studio" : "/"} className="brand">
          <span className="brand-mark">
            <Cast size={20} />
          </span>
          studio<span className="brand-light">ctrl</span>
        </Link>
        <div className="header-status">
          <span className={`connection-status ${status}`}>
            <Circle size={7} fill="currentColor" />
            {status === "connected"
              ? "Connected to OBS"
              : status === "connecting"
                ? "Connecting…"
                : "Not connected"}
          </span>
          {status !== "disconnected" && (
            <Button variant="ghost" size="sm" onClick={exit}>
              <LogOut />
              {status === "connecting" ? "Cancel" : "Exit"}
            </Button>
          )}
        </div>
      </header>
      {error && (
        <div role="alert" className="global-error page-width">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss error"
            onClick={client.clearError}
          >
            <X />
          </Button>
        </div>
      )}
      <Routes>
        <Route
          path="/"
          element={
            status === "connected" ? (
              <Navigate to="/studio" replace />
            ) : (
              <Connections />
            )
          }
        />
        <Route path="/studio" element={<Studio />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
