import { Clapperboard, Layers, LoaderCircle } from "lucide-react";
import { Navigate } from "react-router-dom";
import { SceneButton } from "../components/scene-button";
import { SceneMonitor } from "../components/scene-monitor";
import { TransitionControl } from "../components/transition-control";
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
    busy,
    syncing,
  } = useStudio();
  if (status !== "connected") return <Navigate to="/" replace />;
  const disabled = busy || syncing;
  return (
    <main className="mx-auto w-[calc(100%-3rem)] max-w-[1200px] py-6 max-[720px]:w-[calc(100%-2rem)] max-[720px]:py-4">
      <div className="mb-5 flex items-center justify-between gap-4 max-[720px]:gap-3">
        <h1 className="m-0 text-xl leading-[1.3] font-semibold tracking-[-0.5px]">
          {profile?.name}
        </h1>
      </div>
      {!studio ? (
        <section className="border border-border p-6">
          <h2 className="m-0 text-sm font-medium">Studio Mode is disabled</h2>
          <p className="mt-2 text-xs leading-[1.6] text-muted-foreground">
            Enable Studio Mode to control Preview and transitions.
          </p>
          <Button
            className="mt-4"
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
          <section
            aria-label="Current scenes"
            className="mb-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 max-[900px]:grid-cols-2 max-[720px]:gap-3"
          >
            <SceneMonitor kind="preview" sceneName={preview} />
            <div className="max-[900px]:col-span-2 max-[900px]:row-start-2">
              <TransitionControl />
            </div>
            <div className="min-w-0 max-[900px]:col-start-2 max-[900px]:row-start-1">
              <SceneMonitor kind="program" sceneName={program} />
            </div>
          </section>
          <section aria-label="Scenes">
            <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
              <h2 className="m-0 flex items-center gap-[7px] text-[13px] font-medium [&>svg]:text-muted-foreground">
                <Layers size={17} /> Scenes{" "}
                <span className="bg-muted px-[5px] py-px text-[11px] text-muted-foreground">
                  {scenes.length}
                </span>
              </h2>
              <span className="text-[11px] text-muted-foreground">
                Select for Preview
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
              {scenes.map((scene) => (
                <SceneButton
                  key={scene}
                  name={scene}
                  isPreview={preview === scene}
                  isProgram={program === scene}
                  disabled={disabled}
                  onSelect={() => void client.selectScene(scene)}
                />
              ))}
            </div>
            {!scenes.length && (
              <p className="py-4 text-xs text-muted-foreground">
                No scenes available in this scene collection.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
