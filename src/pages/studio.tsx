import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  Clapperboard,
  Layers,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useStudio } from "../context";
export function Studio() {
  const {
    client,
    status,
    profile,
    studio,
    scenes,
    program,
    preview,
    transitions,
    currentTransition,
    duration,
    busy,
    syncing,
  } = useStudio();
  if (status !== "connected") return <Navigate to="/" replace />;
  const disabled = busy || syncing;
  return (
    <main className="studio-page page-width">
      <div className="page-heading">
        <h1>{profile?.name}</h1>
        <Button
          variant="outline"
          disabled={syncing}
          onClick={() => void client.refresh()}
        >
          <RefreshCw className={syncing ? "animate-spin" : ""} /> Sync
        </Button>
      </div>
      {!studio ? (
        <section className="studio-gate">
          <h2>Studio Mode is disabled</h2>
          <p>Enable Studio Mode to control Preview and transitions.</p>
          <Button
            disabled={disabled}
            onClick={() => void client.enableStudio()}
          >
            {disabled ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Clapperboard />
            )}{" "}
            Enable Studio Mode
          </Button>
        </section>
      ) : (
        <>
          <section className="buses" aria-label="Current scenes">
            <article className="bus preview-bus">
              <div className="bus-label">
                <span className="status-dot" /> Preview
              </div>
              <h2>{preview ?? "No preview scene"}</h2>
            </article>
            <div className="bus-direction">
              <ArrowRight size={22} />
            </div>
            <article className="bus program-bus">
              <div className="bus-label">
                <span className="status-dot" /> Program
              </div>
              <h2>{program ?? "No program scene"}</h2>
            </article>
          </section>
          <div className="studio-workspace">
            <section className="scene-section">
              <div className="section-heading">
                <h2>
                  <Layers size={17} /> Scenes{" "}
                  <span className="count">{scenes.length}</span>
                </h2>
                <span>Select for Preview</span>
              </div>
              <div className="scene-list">
                {scenes.map((scene, i) => (
                  <button
                    className={`scene-row ${preview === scene ? "is-preview" : ""}`}
                    key={scene}
                    disabled={disabled}
                    onClick={() => void client.selectScene(scene)}
                    aria-pressed={preview === scene}
                  >
                    <span className="scene-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="scene-name">{scene}</span>
                    <span className="scene-tags">
                      {preview === scene && (
                        <span className="scene-tag preview-tag">
                          <Check size={12} /> PREVIEW
                        </span>
                      )}
                      {program === scene && (
                        <span className="scene-tag program-tag">
                          <span className="status-dot" /> PROGRAM
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                {!scenes.length && (
                  <p className="empty-list">
                    No scenes available in this scene collection.
                  </p>
                )}
              </div>
            </section>
            <aside className="transition-section">
              <div className="section-heading">
                <h2>
                  <ArrowRightLeft size={17} /> Transitions
                </h2>
              </div>
              <div className="transition-list">
                {transitions.map((name) => (
                  <Button
                    key={name}
                    variant="outline"
                    className="transition-button"
                    disabled={disabled || !preview}
                    onClick={() => void client.transition(name)}
                  >
                    <span>{name}</span>
                    <ArrowRight />
                  </Button>
                ))}
                {!transitions.length && (
                  <p className="empty-list">
                    Add a transition in OBS to see it here.
                  </p>
                )}
              </div>
              <div className="transition-settings">
                <span>OBS transition</span>
                <strong>{currentTransition ?? "—"}</strong>
                <span>Duration</span>
                <strong>
                  {duration == null ? "Fixed by transition" : `${duration} ms`}
                </strong>
              </div>
              <p className="transition-note">Uses OBS transition settings.</p>
              {busy && (
                <p role="status" className="busy-indicator">
                  <LoaderCircle size={14} className="animate-spin" /> Updating
                  OBS…
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
