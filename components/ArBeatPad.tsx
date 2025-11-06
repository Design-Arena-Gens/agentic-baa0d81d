"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioEngine, DEFAULT_CLIPS, PAD_META, type ActiveClip, type LoopClip, type LoopEvent, type PadId } from "./AudioEngine";
import clsx from "clsx";

type Burst = {
  id: string;
  x: number;
  y: number;
  color: string;
};

type CameraFilter = {
  id: string;
  name: string;
  css: string;
  description: string;
};

const padOrder: PadId[] = ["kick", "snare", "hat", "bass", "lead", "fx"];

const cameraFilters: CameraFilter[] = [
  {
    id: "aurora",
    name: "Aurora Bloom",
    css: "contrast(1.15) saturate(1.2) hue-rotate(22deg)",
    description: "Glowing magenta waves"
  },
  {
    id: "neon",
    name: "Neon Vapor",
    css: "contrast(1.25) saturate(1.35) hue-rotate(110deg)",
    description: "Electric cyan haze"
  },
  {
    id: "void",
    name: "Void Night",
    css: "contrast(1.4) saturate(1.4) brightness(0.82)",
    description: "Deep noir pulses"
  },
  {
    id: "solar",
    name: "Solar Flare",
    css: "contrast(1.1) saturate(1.8) hue-rotate(-35deg)",
    description: "Golden energy trails"
  }
];

const skinUnlocks = [
  { id: "aurora", name: "Aurora Bloom", threshold: 0 },
  { id: "nebula", name: "Nebula Nova", threshold: 400 },
  { id: "nova", name: "Nova Prism", threshold: 800 },
  { id: "hyper", name: "Hyper Flux", threshold: 1500 }
];

const randomColor = () =>
  ["#ff6ac1", "#5ee7ff", "#ffd166", "#9d4edd", "#f72585", "#4cc9f0"][
    Math.floor(Math.random() * 6)
  ];

const uid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

function formatRelative(ts: number) {
  const delta = Date.now() - ts;
  const hours = Math.floor(delta / (1000 * 60 * 60));
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(delta / (1000 * 60)));
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ArBeatPad() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const padRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AudioEngine>();
  if (!engineRef.current) {
    engineRef.current = new AudioEngine();
  }
  const engine = engineRef.current;

  const [audioReady, setAudioReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [bpm, setBpm] = useState(104);
  const [filterValue, setFilterValue] = useState(18000);
  const [reverbValue, setReverbValue] = useState(0.28);
  const [points, setPoints] = useState(120);
  const [streak, setStreak] = useState(0);
  const [cameraFilter, setCameraFilter] = useState<CameraFilter>(cameraFilters[0]);
  const [currentEvents, setCurrentEvents] = useState<LoopEvent[]>([]);
  const [sharedClips, setSharedClips] = useState<LoopClip[]>(DEFAULT_CLIPS);
  const [activeClip, setActiveClip] = useState<ActiveClip | null>(null);
  const [activeSkin, setActiveSkin] = useState(skinUnlocks[0].id);
  const [loopTitle, setLoopTitle] = useState("");
  const [showHud, setShowHud] = useState(true);

  const unlockedSkins = useMemo(
    () => skinUnlocks.filter((skin) => points >= skin.threshold),
    [points]
  );

  useEffect(() => {
    let current: MediaStream | null = null;
    const bootCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("AR camera unavailable on this device");
        return;
      }
      try {
        current = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1080 },
            height: { ideal: 1920 }
          },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = current;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        console.error(err);
        setCameraError("Camera access denied. Enable camera to explore AR pad.");
      }
    };

    bootCamera();

    return () => {
      current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("pulsecanvas-clips");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as LoopClip[];
        setSharedClips([...DEFAULT_CLIPS, ...parsed]);
      } catch {
        setSharedClips(DEFAULT_CLIPS);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "pulsecanvas-clips",
      JSON.stringify(sharedClips.filter((clip) => !DEFAULT_CLIPS.find((c) => c.id === clip.id)))
    );
  }, [sharedClips]);

  const ensureAudio = useCallback(async () => {
    if (audioReady) return;
    await engine.init();
    setAudioReady(true);
  }, [audioReady, engine]);

  const addBurst = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!padRef.current) return;
    const bounds = padRef.current.getBoundingClientRect();
    const burst: Burst = {
      id: uid(),
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      color: randomColor()
    };
    setBursts((prev) => [...prev.slice(-10), burst]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, 420);
  }, []);

  const handlePadTrigger = useCallback(
    async (padId: PadId, event: React.PointerEvent<HTMLButtonElement>) => {
      await ensureAudio();
      const { tick } = engine.triggerPad(padId, 1);
      setCurrentEvents((prev) => [...prev, { tick, padId, velocity: 1 }]);
      setPoints((prev) => prev + 5 + Math.floor(streak / 3));
      setStreak((prev) => prev + 1);
      addBurst(event);
    },
    [ensureAudio, engine, streak, addBurst]
  );

  const handleSaveClip = useCallback(() => {
    if (currentEvents.length === 0) return;
    const normalized = currentEvents
      .map((evt) => ({ ...evt, tick: Math.abs(evt.tick % 16) }))
      .sort((a, b) => a.tick - b.tick);
    const clipTitle = loopTitle.trim() || `Pulse ${sharedClips.length + 1}`;
    const clip: LoopClip = {
      id: uid(),
      title: clipTitle,
      author: "You",
      bpm,
      color: randomColor(),
      createdAt: Date.now(),
      likes: Math.floor(Math.random() * 70),
      remixes: 0,
      events: normalized
    };
    setSharedClips((prev) => [clip, ...prev]);
    setPoints((prev) => prev + 140);
    setLoopTitle("");
    setCurrentEvents([]);
  }, [bpm, currentEvents, loopTitle, sharedClips.length]);

  const handleRemixClip = useCallback(
    async (clip: LoopClip) => {
      await ensureAudio();
      setCurrentEvents(clip.events);
      setBpm(clip.bpm);
      setPoints((prev) => prev + 80);
      setSharedClips((prev) =>
        prev.map((item) =>
          item.id === clip.id ? { ...item, remixes: item.remixes + 1 } : item
        )
      );
      if (activeClip) {
        engine.stopClip(activeClip);
      }
      const instance = engine.createClip(clip);
      setActiveClip(instance);
    },
    [ensureAudio, engine, activeClip]
  );

  const handlePlayCapture = useCallback(async () => {
    if (currentEvents.length === 0) return;
    await ensureAudio();
    if (activeClip) {
      engine.stopClip(activeClip);
    }
    const clip: LoopClip = {
      id: uid(),
      title: "Live Sketch",
      author: "You",
      bpm,
      color: "#ff6ac1",
      createdAt: Date.now(),
      likes: 0,
      remixes: 0,
      events: currentEvents
    };
    const instance = engine.createClip(clip);
    setActiveClip(instance);
  }, [activeClip, bpm, currentEvents, engine, ensureAudio]);

  useEffect(() => {
    engine.setBpm(bpm);
  }, [engine, bpm]);

  useEffect(() => {
    engine.setFilterFrequency(filterValue);
  }, [engine, filterValue]);

  useEffect(() => {
    engine.setReverbWet(reverbValue);
  }, [engine, reverbValue]);

  useEffect(() => {
    return () => {
      activeClip?.part?.dispose();
      engine.dispose();
    };
  }, [activeClip, engine]);

  useEffect(() => {
    if (!cameraReady || !containerRef.current) return;
    const handleOrientation = () => {
      if (window.matchMedia("(orientation: landscape)").matches) {
        setShowHud(false);
      } else {
        setShowHud(true);
      }
    };
    handleOrientation();
    window.addEventListener("orientationchange", handleOrientation);
    return () => window.removeEventListener("orientationchange", handleOrientation);
  }, [cameraReady]);

  return (
    <div ref={containerRef} className="relative flex h-dvh flex-col overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        muted
        className={clsx(
          "absolute inset-0 h-full w-full object-cover transition-all duration-700",
          cameraReady ? "opacity-100" : "opacity-0"
        )}
        style={{ filter: cameraFilter.css }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/80" />
      <div className="relative z-10 flex h-full w-full flex-col px-6 pb-6 pt-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">PulseCanvas</p>
            <h1 className="mt-1 text-3xl font-semibold text-white">AR Beat Collages</h1>
          </div>
          <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-right backdrop-blur">
            <p className="text-xs text-white/60">Points</p>
            <p className="text-lg font-semibold text-white">{points}</p>
            <p className="text-[10px] uppercase tracking-widest text-neo-cyan">
              Streak {streak}
            </p>
          </div>
        </header>

        {cameraError && (
          <div className="mt-4 rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {cameraError}
          </div>
        )}

        <div className="mt-6 flex flex-1 flex-col">
          <div
            ref={padRef}
            className={clsx(
              "relative mx-auto flex aspect-square w-full max-w-xl items-center justify-center rounded-full border border-white/10 bg-white/5 p-6",
              "backdrop-blur-xl shadow-[0_0_120px_rgba(255,106,193,0.35)]"
            )}
          >
            <div className="absolute inset-4 rounded-full border border-white/10 bg-grid-glow opacity-80" />
            {padOrder.map((padId, index) => {
              const angle = (360 / padOrder.length) * index;
              const config = PAD_META[padId];
              return (
                <button
                  key={padId}
                  className={clsx(
                    "group absolute h-32 w-20 origin-bottom -translate-x-1/2 -translate-y-full rounded-full border border-white/20",
                    "bg-gradient-to-b from-white/20 to-white/0 backdrop-blur-xl transition-transform duration-150",
                    "hover:scale-105 active:scale-110",
                    config.ring
                  )}
                  style={{
                    transform: `rotate(${angle}deg) translateY(-120px) rotate(${-angle}deg)`
                  }}
                  onPointerDown={(event) => handlePadTrigger(padId, event)}
                >
                  <div
                    className={clsx(
                      "mx-auto mt-3 h-10 w-10 rounded-full border border-white/20 bg-gradient-to-br shadow-glow transition-all group-active:scale-110",
                      `from-white/30 via-white/10 to-transparent`
                    )}
                    style={{
                      boxShadow: `0 0 60px ${config.color.split(" ").at(0) ?? "rgba(255,255,255,0.42)"}`
                    }}
                  />
                  <p className="mt-3 text-center text-xs font-semibold uppercase tracking-widest text-white/80">
                    {config.label}
                  </p>
                  <p className="text-center text-[10px] uppercase text-white/40">
                    {config.description}
                  </p>
                </button>
              );
            })}
            <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-white/40 bg-black/30 shadow-inner shadow-white/10 backdrop-blur">
              <button
                className="pointer-events-auto flex h-28 w-28 items-center justify-center rounded-full border border-neo-cyan/40 bg-gradient-to-br from-neo-purple/40 via-transparent to-black/60 text-xs uppercase tracking-[0.4em] text-white/80 shadow-glow backdrop-blur-lg"
                onPointerDown={async () => {
                  await ensureAudio();
                  if (activeClip) {
                    engine.stopClip(activeClip);
                    setActiveClip(null);
                  } else if (DEFAULT_CLIPS.length > 0) {
                    const first = DEFAULT_CLIPS[0];
                    setBpm(first.bpm);
                    const clip = engine.createClip(DEFAULT_CLIPS[0]);
                    setActiveClip(clip);
                  }
                }}
              >
                {activeClip ? "Stop" : "Play"}
              </button>
            </div>
            <AnimatePresence>
              {bursts.map((burst) => (
                <motion.span
                  key={burst.id}
                  initial={{ scale: 0, opacity: 0.9 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="pointer-events-none absolute h-6 w-6 rounded-full blur-sm"
                  style={{
                    left: burst.x,
                    top: burst.y,
                    background: burst.color
                  }}
                />
              ))}
            </AnimatePresence>
          </div>

          {showHud && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm uppercase tracking-[0.35em] text-white/60">
                    Tempo & Atmos
                  </h2>
                  <span className="text-xs text-white/60">{bpm} bpm</span>
                </div>
                <input
                  className="mt-4 h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-neo-pink"
                  type="range"
                  min={80}
                  max={140}
                  value={bpm}
                  onChange={(event) => setBpm(Number(event.target.value))}
                />
                <div className="mt-4 text-xs uppercase tracking-[0.35em] text-white/60">
                  Filter sweep
                </div>
                <input
                  className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-neo-cyan"
                  type="range"
                  min={2000}
                  max={18000}
                  value={filterValue}
                  onChange={(event) => setFilterValue(Number(event.target.value))}
                />
                <div className="mt-4 text-xs uppercase tracking-[0.35em] text-white/60">
                  Reverb
                </div>
                <input
                  className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-neo-yellow"
                  type="range"
                  min={0}
                  max={0.7}
                  value={reverbValue}
                  step={0.01}
                  onChange={(event) => setReverbValue(Number(event.target.value))}
                />
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <h2 className="text-sm uppercase tracking-[0.35em] text-white/60">
                  Capture & Share
                </h2>
                <input
                  className="mt-4 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-neo-cyan focus:outline-none"
                  placeholder="Name your collage"
                  value={loopTitle}
                  onChange={(event) => setLoopTitle(event.target.value)}
                />
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={handlePlayCapture}
                    className="flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs uppercase tracking-[0.35em] text-white/80 transition hover:border-neo-pink hover:bg-neo-pink/20"
                  >
                    Preview
                  </button>
                  <button
                    onClick={handleSaveClip}
                    className="flex-1 rounded-2xl border border-neo-yellow/80 bg-neo-yellow/20 px-4 py-3 text-xs uppercase tracking-[0.4em] text-neo-yellow transition hover:bg-neo-yellow/30"
                  >
                    Share Clip
                  </button>
                  <button
                    onClick={() => {
                      setCurrentEvents([]);
                      setStreak(0);
                    }}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.35em] text-white/60 transition hover:border-white/30 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-white/60">
                  <p>Unlocked Skins:</p>
                  <div className="mt-2 flex gap-2">
                    {unlockedSkins.map((skin) => (
                      <button
                        key={skin.id}
                        onClick={() => setActiveSkin(skin.id)}
                        className={clsx(
                          "flex-1 rounded-xl border px-3 py-2 text-[10px] uppercase tracking-[0.35em]",
                          activeSkin === skin.id
                            ? "border-neo-pink bg-neo-pink/20 text-white"
                            : "border-white/10 bg-white/5 text-white/60"
                        )}
                      >
                        {skin.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.35em] text-white/60">
                Camera Filters
              </h2>
              <span className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                {cameraFilter.name}
              </span>
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {cameraFilters.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setCameraFilter(filter)}
                  className={clsx(
                    "h-24 w-32 flex-shrink-0 rounded-2xl border p-3 text-left text-xs leading-tight text-white/70 transition",
                    cameraFilter.id === filter.id
                      ? "border-neo-cyan bg-neo-cyan/20"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <p className="text-[10px] uppercase tracking-[0.35em]">{filter.name}</p>
                  <p className="mt-2 text-[11px] text-white/60">{filter.description}</p>
                </button>
              ))}
            </div>
          </div>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.35em] text-white/60">
                Community Loop Stream
              </h2>
              <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                Remix, battle, earn
              </p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {sharedClips.map((clip) => (
                <motion.article
                  key={clip.id}
                  layout
                  className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur transition hover:border-white/20"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{clip.title}</p>
                      <p className="text-xs text-white/50">
                        by {clip.author} • {clip.bpm} bpm • {formatRelative(clip.createdAt)}
                      </p>
                    </div>
                    <div
                      className="h-10 w-10 rounded-full border border-white/10"
                      style={{ background: clip.color, boxShadow: `0 0 30px ${clip.color}55` }}
                    />
                  </div>
                  <div className="mt-3 flex gap-3 text-[10px] uppercase tracking-[0.35em] text-white/50">
                    <span>❤ {clip.likes}</span>
                    <span>Remix ⚡ {clip.remixes}</span>
                  </div>
                  <div className="mt-3 flex gap-2 text-xs">
                    <button
                      onClick={() => handleRemixClip(clip)}
                      className="flex-1 rounded-xl border border-neo-purple/60 bg-neo-purple/20 py-2 text-[10px] uppercase tracking-[0.35em] text-white transition hover:bg-neo-purple/30"
                    >
                      Remix
                    </button>
                    <button
                      onClick={async () => {
                        await ensureAudio();
                        setActiveClip((prev) => {
                          if (prev) {
                            engine.stopClip(prev);
                          }
                          return engine.createClip(clip);
                        });
                      }}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-[10px] uppercase tracking-[0.35em] text-white/70 transition hover:border-white/20 hover:text-white"
                    >
                      Play
                    </button>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
