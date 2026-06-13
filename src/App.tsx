import {
  Flame,
  Heart,
  Image,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Square,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const STORAGE_SESSIONS = "focus-learn-sessions";
const STORAGE_BGM = "focus-learn-bgm-library";
const STORAGE_SETTINGS = "focus-learn-settings";
const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;
const DEFAULT_BACKGROUND =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1400&q=80";
const PRESETS: BgmTrack[] = [
  { label: "Lo-Fi Girl", id: "jfKfPfyJRdk", favorite: true, source: "preset" },
  { label: "Chillhop Radio", id: "5yx6BWlEVcY", favorite: false, source: "preset" },
];

type Mode = "focus" | "break";
type SessionMap = Record<string, number>;
type BgmTrack = {
  id: string;
  label: string;
  favorite: boolean;
  source: "preset" | "history";
};
type TimerSettings = {
  focusMinutes: number;
  breakMinutes: number;
  backgroundUrl: string;
  blurEnabled: boolean;
};

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function clampMinutes(value: number) {
  if (Number.isNaN(value)) return 1;
  return Math.min(120, Math.max(1, Math.round(value)));
}

function minutesToSeconds(minutes: number) {
  return clampMinutes(minutes) * 60;
}

function extractVideoId(input: string) {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "").slice(0, 11);
    if (url.pathname.includes("/shorts/")) return url.pathname.split("/shorts/")[1]?.slice(0, 11) ?? "";
    return url.searchParams.get("v")?.slice(0, 11) ?? "";
  } catch {
    return "";
  }
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadBgmLibrary() {
  const saved = loadJson<BgmTrack[]>(STORAGE_BGM, []);
  const savedById = new Map(saved.map((track) => [track.id, track]));
  const presets = PRESETS.map((preset) => ({ ...preset, favorite: savedById.get(preset.id)?.favorite ?? preset.favorite }));
  const histories = saved.filter((track) => !PRESETS.some((preset) => preset.id === track.id));
  return [...presets, ...histories];
}

function loadSettings(): TimerSettings {
  const saved = loadJson<Partial<TimerSettings>>(STORAGE_SETTINGS, {});
  return {
    focusMinutes: DEFAULT_FOCUS_MINUTES,
    breakMinutes: DEFAULT_BREAK_MINUTES,
    backgroundUrl: DEFAULT_BACKGROUND,
    blurEnabled: false,
    ...saved,
  };
}

function fileToBackgroundDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("画像を読み込めなかった"));
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("画像を変換できなかった"));
          return;
        }
        context.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function calculateStreak(sessions: SessionMap) {
  let streak = 0;
  const day = new Date();

  while (sessions[todayKey(day)] > 0) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }

  return streak;
}

function buildDays(days = 28) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    return todayKey(date);
  });
}

function TimerRing({ total, remaining, mode }: { total: number; remaining: number; mode: Mode }) {
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const progress = total === 0 ? 0 : (total - remaining) / total;
  const offset = circumference - progress * circumference;

  return (
    <div className="relative grid place-items-center">
      <svg className="-rotate-90" width="224" height="224" viewBox="0 0 224 224" aria-hidden="true">
        <circle cx="112" cy="112" r={radius} className="stroke-white/15" strokeWidth="14" fill="none" />
        <circle
          cx="112"
          cy="112"
          r={radius}
          className={mode === "focus" ? "stroke-emerald-300" : "stroke-amber-200"}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-mono text-5xl font-semibold tracking-normal text-white sm:text-6xl">{formatTime(remaining)}</p>
        <p className="mt-2 text-sm font-semibold text-white/75">{mode === "focus" ? "集中モード" : "休憩モード"}</p>
      </div>
    </div>
  );
}

function TimerSettingsPanel({
  settings,
  onSave,
  onBackgroundChange,
  onClose,
}: {
  settings: TimerSettings;
  onSave: (settings: TimerSettings) => void;
  onBackgroundChange: (url: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [imageError, setImageError] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  const updateDraft = (patch: Partial<TimerSettings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (patch.backgroundUrl !== undefined) onBackgroundChange(patch.backgroundUrl);
  };

  const save = () => {
    onSave({
      focusMinutes: clampMinutes(draft.focusMinutes),
      breakMinutes: clampMinutes(draft.breakMinutes),
      backgroundUrl: draft.backgroundUrl.trim() || DEFAULT_BACKGROUND,
      blurEnabled: draft.blurEnabled,
    });
  };

  const importPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImageError("");
      const dataUrl = await fileToBackgroundDataUrl(file);
      updateDraft({ backgroundUrl: dataUrl });
    } catch {
      setImageError("画像の取り込みに失敗した");
    }
  };

  return (
    <section className="settings-card grid gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Settings2 size={18} />
          タイマー調整
        </div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/10 text-white" aria-label="閉じる">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-semibold text-white/70">
          集中 分
          <input
            type="number"
            min={1}
            max={120}
            value={draft.focusMinutes}
            onChange={(event) => updateDraft({ focusMinutes: Number(event.target.value) })}
            className="min-h-11 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none focus:border-emerald-300"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-white/70">
          休憩 分
          <input
            type="number"
            min={1}
            max={120}
            value={draft.breakMinutes}
            onChange={(event) => updateDraft({ breakMinutes: Number(event.target.value) })}
            className="min-h-11 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none focus:border-amber-200"
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-white/70">
        背景画像URL
        <div className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3">
          <Image size={17} className="text-white/70" />
          <input
            value={draft.backgroundUrl}
            onChange={(event) => updateDraft({ backgroundUrl: event.target.value })}
            placeholder="https://..."
            className="min-h-11 bg-transparent text-sm text-white outline-none"
          />
        </div>
      </label>
      <label className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-3 text-sm text-white">
        <input
          type="checkbox"
          checked={draft.blurEnabled}
          onChange={(event) => updateDraft({ blurEnabled: event.target.checked })}
          className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-300"
        />
        <span className="text-xs font-semibold text-white/80">UI のぼかしを有効にする</span>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-white/70">
        スマホの写真から取り込む
        <div className="relative flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 bg-white/10 px-3 text-sm font-bold text-white">
          <Upload size={17} />
          写真を選ぶ
          <input
            type="file"
            accept="image/*"
            onChange={(event) => void importPhoto(event.target.files?.[0])}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>
      </label>
      {imageError && <p className="text-xs font-semibold text-rose-200">{imageError}</p>}
      <button onClick={save} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white text-sm font-bold text-slate-950">
        <Save size={17} />
        保存して反映
      </button>
    </section>
  );
}

type BgmControllerHandle = {
  playCurrentTrack: () => void;
};

function BgmController({ onReady }: { onReady?: (handle: BgmControllerHandle) => void }) {
  const [library, setLibrary] = useState<BgmTrack[]>(() => loadBgmLibrary());
  const [videoId, setVideoId] = useState(() => loadBgmLibrary().find((track) => track.favorite)?.id ?? PRESETS[0].id);
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<YouTubePlayer | null>(null);

  const currentTrack = library.find((track) => track.id === videoId);
  const favorites = library.filter((track) => track.favorite);
  const history = library.filter((track) => track.source === "history");

  const chooseRandomFavorite = (excludeId?: string) => {
    const candidates = favorites.filter((track) => track.id !== excludeId);
    if (candidates.length === 0) return;
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    playTrack(next);
  };

  useEffect(() => {
    onReady?.({
      playCurrentTrack: () => {
        if (!playerRef.current) return;
        playerRef.current.playVideo();
        setIsPlaying(true);
      },
    });
  }, [onReady]);

  useEffect(() => {
    saveJson(STORAGE_BGM, library.filter((track) => track.source === "history" || track.favorite !== PRESETS.find((preset) => preset.id === track.id)?.favorite));
  }, [library]);

  useEffect(() => {
    const createPlayer = () => {
      if (!window.YT || playerRef.current) return;
      playerRef.current = new window.YT.Player("youtube-player", {
        videoId,
        width: 200,
        height: 120,
        playerVars: { playsinline: 1, controls: 1, rel: 0 },
        events: {
          onReady: (event) => event.target.setVolume(45),
          onStateChange: (event) => {
            if (event.data === 0) {
              chooseRandomFavorite(videoId);
            }
          },
        },
      });
    };

    if (window.YT) {
      createPlayer();
      return;
    }

    window.onYouTubeIframeAPIReady = createPlayer;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(script);
  }, [videoId]);

  const playTrack = (track: BgmTrack) => {
    setVideoId(track.id);
    setInput(track.id);
    playerRef.current?.loadVideoById(track.id);
    setIsPlaying(true);
  };

  const addTrack = () => {
    const id = extractVideoId(input);
    if (!id) return;
    const name = label.trim() || `BGM ${id}`;
    const nextTrack: BgmTrack = { id, label: name, favorite: false, source: "history" };

    setLibrary((previous) => {
      const withoutDuplicate = previous.filter((track) => track.id !== id);
      return [nextTrack, ...withoutDuplicate].slice(0, 16);
    });
    setLabel("");
    playTrack(nextTrack);
  };

  const toggleFavorite = (id: string) => {
    setLibrary((previous) => previous.map((track) => (track.id === id ? { ...track, favorite: !track.favorite } : track)));
  };

  const removeTrack = (id: string) => {
    setLibrary((previous) => previous.filter((track) => track.source === "preset" || track.id !== id));
    if (videoId === id) playTrack(PRESETS[0]);
  };

  const togglePlayback = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const renderTrack = (track: BgmTrack) => (
    <div key={track.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">
      <button onClick={() => playTrack(track)} className="min-w-0 text-left">
        <span className="block truncate text-sm font-semibold text-white">{track.label}</span>
        <span className="block truncate font-mono text-[11px] text-white/45">{track.id}</span>
      </button>
      <button
        onClick={() => toggleFavorite(track.id)}
        className={`grid h-9 w-9 place-items-center rounded-lg border border-white/10 ${track.favorite ? "text-amber-200" : "text-white/45"}`}
        aria-label="お気に入り切替"
      >
        <Star size={17} className={track.favorite ? "fill-amber-200" : ""} />
      </button>
      {track.source === "history" && (
        <button
          onClick={() => removeTrack(track.id)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/45"
          aria-label="履歴から削除"
        >
          <Trash2 size={17} />
        </button>
      )}
    </div>
  );

  return (
    <section className="glass-panel grid gap-3 p-3 sm:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
            <Music2 size={18} />
            <span className="truncate">BGM {currentTrack ? `- ${currentTrack.label}` : ""}</span>
          </div>
          <button onClick={togglePlayback} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-white">
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            {isPlaying ? "停止" : "再生"}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="YouTube URL / 動画ID"
            className="min-h-12 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-300"
          />
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="名前"
            className="min-h-12 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-300"
          />
          <button onClick={addTrack} className="min-h-12 rounded-lg bg-emerald-300 px-4 text-sm font-bold text-slate-950">
            BGMに設定
          </button>
        </div>
        <div className="grid gap-2">
          {favorites.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs font-bold text-amber-100">
                <Heart size={14} className="fill-amber-100" />
                お気に入り
              </p>
              <div className="grid gap-2">{favorites.map(renderTrack)}</div>
            </div>
          )}
          {history.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold text-white/55">履歴</p>
              <div className="grid gap-2">{history.map(renderTrack)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/15 bg-black">
        <div id="youtube-player" className="h-[120px] w-[200px]" />
      </div>
    </section>
  );
}

function EffortTiles({ sessions }: { sessions: SessionMap }) {
  const days = useMemo(() => buildDays(), []);
  const maxCount = Math.max(1, ...Object.values(sessions));

  return (
    <section className="glass-panel p-3">
      <div className="mb-3 flex items-center justify-between text-sm text-white/75">
        <span>努力の草</span>
        <span>今日は {sessions[todayKey()] ?? 0} 回</span>
      </div>
      <div className="grid grid-cols-14 gap-1">
        {days.map((day) => {
          const count = sessions[day] ?? 0;
          const opacity = count === 0 ? 0.16 : 0.35 + (count / maxCount) * 0.65;
          return <div key={day} title={`${day}: ${count} 回`} className="aspect-square rounded-[3px] bg-emerald-300" style={{ opacity }} />;
        })}
      </div>
    </section>
  );
}

export function App() {
  const [settings, setSettings] = useState<TimerSettings>(() => loadSettings());
  const [backgroundPreview, setBackgroundPreview] = useState(settings.backgroundUrl);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(() => minutesToSeconds(settings.focusMinutes));
  const [isRunning, setIsRunning] = useState(false);
  const [bgmControllerHandle, setBgmControllerHandle] = useState<BgmControllerHandle | null>(null);
  const [sessions, setSessions] = useState<SessionMap>(() => loadJson<SessionMap>(STORAGE_SESSIONS, {}));
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const focusSeconds = minutesToSeconds(settings.focusMinutes);
  const breakSeconds = minutesToSeconds(settings.breakMinutes);
  const total = mode === "focus" ? focusSeconds : breakSeconds;
  const streak = calculateStreak(sessions);

  useEffect(() => {
    if (isRunning) return;
    setRemaining(mode === "focus" ? focusSeconds : breakSeconds);
  }, [focusSeconds, breakSeconds, mode]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setRemaining((current) => {
        if (current > 1) return current - 1;

        if (mode === "focus") {
          setSessions((previous) => {
            const key = todayKey();
            const next = { ...previous, [key]: (previous[key] ?? 0) + 1 };
            saveJson(STORAGE_SESSIONS, next);
            return next;
          });
          setMode("break");
          return breakSeconds;
        }

        setMode("focus");
        return focusSeconds;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [breakSeconds, focusSeconds, isRunning, mode]);

  useEffect(() => {
    const releaseWakeLock = async () => {
      try {
        await wakeLockRef.current?.release();
      } catch {
        // Wake Lock release can fail on some browsers; the timer should keep working.
      } finally {
        wakeLockRef.current = null;
      }
    };

    const requestWakeLock = async () => {
      if (!isRunning || document.visibilityState !== "visible" || !navigator.wakeLock || wakeLockRef.current) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        });
      } catch {
        wakeLockRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isRunning) {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    if (isRunning) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [isRunning]);

  const saveSettings = (nextSettings: TimerSettings) => {
    setSettings(nextSettings);
    setBackgroundPreview(nextSettings.backgroundUrl);
    saveJson(STORAGE_SETTINGS, nextSettings);
    setIsRunning(false);
    setIsSettingsOpen(false);
    setRemaining(mode === "focus" ? minutesToSeconds(nextSettings.focusMinutes) : minutesToSeconds(nextSettings.breakMinutes));
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setRemaining(nextMode === "focus" ? focusSeconds : breakSeconds);
    setIsRunning(false);
  };

  const reset = () => {
    setIsRunning(false);
    setRemaining(total);
  };

  const toggleStartPause = () => {
    setIsRunning((current) => !current);
  };

  return (
    <main
      className={`app-shell min-h-dvh px-4 py-4 text-white sm:px-6 ${settings.blurEnabled ? "" : "blur-disabled"}`}
      style={{ "--focus-bg": `url("${backgroundPreview || DEFAULT_BACKGROUND}")` } as CSSProperties}
    >
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-4xl flex-col gap-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-normal">Focus Learn</h1>
            <p className="text-xs text-white/55">custom pomodoro room</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-amber-200/35 bg-black/20 px-3 py-2 text-sm font-bold text-amber-100 backdrop-blur-md">
              <Flame size={17} />
              Streak {streak}
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/20 text-white backdrop-blur-md"
              aria-label="タイマー調整を開く"
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>

        <section className="focus-stage">
          <div className="stage-shade" />
          <div className="relative z-10 grid gap-4">
            <section className="timer-glass grid justify-items-center gap-4 p-4">
              <div className="flex rounded-lg border border-white/15 bg-white/10 p-1 backdrop-blur-md">
                <button
                  onClick={() => switchMode("focus")}
                  className={`min-h-11 rounded-md px-5 text-sm font-bold ${mode === "focus" ? "bg-emerald-300 text-slate-950" : "text-white/70"}`}
                >
                  集中
                </button>
                <button
                  onClick={() => switchMode("break")}
                  className={`min-h-11 rounded-md px-5 text-sm font-bold ${mode === "break" ? "bg-amber-200 text-slate-950" : "text-white/70"}`}
                >
                  休憩
                </button>
              </div>
              <TimerRing total={total} remaining={remaining} mode={mode} />
              {!isRunning ? (
                <div className="grid w-full grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsRunning(true)}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-emerald-300 text-sm font-bold text-slate-950"
                  >
                    <Play size={18} />
                    Start
                  </button>
                  <button
                    onClick={() => {
                      setIsRunning(true);
                      bgmControllerHandle?.playCurrentTrack();
                    }}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 text-sm font-bold text-white"
                  >
                    <Play size={18} />
                    Start with BGM
                  </button>
                </div>
              ) : (
                <div className="grid w-full grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsRunning(false)}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-emerald-300 text-sm font-bold text-slate-950"
                  >
                    <Pause size={18} />
                    Pause
                  </button>
                  <button
                    onClick={reset}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 text-sm font-bold text-white"
                  >
                    <RotateCcw size={18} />
                    Reset
                  </button>
                </div>
              )}
            </section>
          </div>
        </section>

        {isSettingsOpen && (
          <div className="settings-modal" role="dialog" aria-modal="true" aria-label="タイマー調整">
            <button className="settings-backdrop" onClick={() => setIsSettingsOpen(false)} aria-label="閉じる" />
            <TimerSettingsPanel
              settings={settings}
              onSave={saveSettings}
              onBackgroundChange={setBackgroundPreview}
              onClose={() => {
                setBackgroundPreview(settings.backgroundUrl);
                setIsSettingsOpen(false);
              }}
            />
          </div>
        )}

        <BgmController onReady={setBgmControllerHandle} />
        <EffortTiles sessions={sessions} />

        <footer className="flex items-center justify-center gap-2 pb-1 text-xs text-white/45">
          <Square size={10} className="fill-emerald-300 text-emerald-300" />
          1セット終わるたびに、今日の草が増える
        </footer>
      </div>
    </main>
  );
}
