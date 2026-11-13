import { useEffect } from "react";
import { Clapperboard, LoaderCircle } from "lucide-react";
import { Navigate } from "react-router-dom";
import { SceneButton } from "../components/scene-button";
import { MediaSeekers } from "../components/media-seekers";
import { SceneMonitor } from "../components/scene-monitor";
import { TransitionControl } from "../components/transition-control";
import { Button } from "../components/ui/button";
import { ScrollArea, ScrollBar } from "../components/ui/scroll-area";
import { useStudio } from "../context";

export function Studio() {
  const {
    client,
    status,
    studio,
    scenes,
    program,
    preview,
    busy,
    syncing,
    previewEpoch,
    thumbnails,
    generating,
    hiddenScenes,
    showHiddenScenes,
  } = useStudio();
  useEffect(() => {
    if (status !== "connected" || !studio) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function collect() {
      if (!document.hidden) await client.collectPreviews();
      if (!stopped) timer = setTimeout(() => void collect(), 1000);
    }
    void collect();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [client, status, studio, previewEpoch]);
  if (status !== "connected") return <Navigate to="/" replace />;
  const disabled = busy || syncing || !!generating;
  const visibleScenes = scenes.filter(
    (scene) => showHiddenScenes || !hiddenScenes.includes(scene),
  );
  return (
    <main className="mx-auto w-[calc(100%-3rem)] max-w-7xl py-6 max-[720px]:w-[calc(100%-2rem)] max-[720px]:py-4">
      {!studio ? (
        <section className="border border-border p-6">
          <h2 className="font-heading m-0 text-sm font-medium">
            Studio Mode is disabled
          </h2>
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
            <div className="self-stretch max-[900px]:col-span-2 max-[900px]:row-start-2">
              <TransitionControl />
            </div>
            <div className="min-w-0 max-[900px]:col-start-2 max-[900px]:row-start-1">
              <SceneMonitor kind="program" sceneName={program} />
            </div>
          </section>
          <section aria-label="Scenes">
            <ScrollArea
              className="w-full [&>[data-slot=scroll-area-viewport]]:scroll-fade-x"
              type="auto"
            >
              <div className="grid w-max grid-flow-col auto-cols-[132px] gap-3 p-1">
                {visibleScenes.map((scene) => (
                  <SceneButton
                    key={scene}
                    name={scene}
                    image={thumbnails[scene]}
                    isPreview={preview === scene}
                    isProgram={program === scene}
                    disabled={disabled}
                    hidden={hiddenScenes.includes(scene)}
                    onGenerate={() => void client.generatePreviews(scene)}
                    onToggleHidden={() =>
                      client.setSceneHidden(
                        scene,
                        !hiddenScenes.includes(scene),
                      )
                    }
                    onSelect={() => void client.selectScene(scene)}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>
            {!visibleScenes.length && (
              <p className="py-4 text-xs text-muted-foreground">
                {scenes.length
                  ? "All scenes are hidden. Enable Show hidden scenes in OBS actions to view them."
                  : "No scenes available in this scene collection."}
              </p>
            )}
          </section>
          <MediaSeekers key={previewEpoch} />
        </>
      )}
    </main>
  );
}
