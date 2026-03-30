import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types & helpers ────────────────────────────────────────────────────────

type BuiltinKey = "system" | "black";
type CustomTheme = { id: string; bg: string; text: string; label: string };
type ThemeKey = BuiltinKey | string;

function resolveTheme(
  key: ThemeKey,
  customs: CustomTheme[],
  dark: boolean
): { bg: string; text: string } {
  if (key === "black") return { bg: "#000000", text: "#FFFFFF" };
  if (key === "system")
    return dark
      ? { bg: "#000000", text: "#FFFFFF" }
      : { bg: "#FFFFFF", text: "#000000" };
  return customs.find((t) => t.id === key) ?? { bg: "#000000", text: "#FFFFFF" };
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function vibrate(p: number[]) {
  if ("vibrate" in navigator) navigator.vibrate(p);
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Stopwatch() {
  // Theme state
  const [themeKey, _setThemeKey] = useState<ThemeKey>(() =>
    load("sw-theme-key", "system")
  );
  const [customs, _setCustoms] = useState<CustomTheme[]>(() =>
    load("sw-customs", [])
  );
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const setThemeKey = (k: ThemeKey) => {
    _setThemeKey(k);
    persist("sw-theme-key", k);
  };
  const setCustoms = (c: CustomTheme[]) => {
    _setCustoms(c);
    persist("sw-customs", c);
  };

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const theme = resolveTheme(themeKey, customs, dark);

  // UI state
  const [themeOpen, setThemeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newBg, setNewBg] = useState("#1c1c1e");
  const [newText, setNewText] = useState("#f5f5f7");
  const [newLabel, setNewLabel] = useState("");
  const [intervalsOpen, setIntervalsOpen] = useState(false);

  // Timer state
  const [intervalsEnabled, setIntervalsEnabled] = useState(false);
  const [workMinutes, setWorkMinutes] = useState(40);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [, setIsWorkPhase] = useState(true);
  const [workDisplay, setWorkDisplay] = useState("00:00");
  const [breakDisplay, setBreakDisplay] = useState("00:00");
  const [workClass, setWorkClass] = useState<
    "active" | "inactive-top" | "inactive-bottom"
  >("active");
  const [breakClass, setBreakClass] = useState<
    "active" | "inactive-top" | "inactive-bottom"
  >("inactive-bottom");
  const [modalIntervals, setModalIntervals] = useState(false);
  const workIn = useRef<HTMLInputElement>(null);
  const breakIn = useRef<HTMLInputElement>(null);

  // Refs (timer internals stay ref-based for accuracy)
  const phaseStart = useRef(0);
  const workMs = useRef(0);
  const breakMs = useRef(0);
  const isWork = useRef(true);
  const intervalsRef = useRef(false);
  const workInterval = useRef(workMinutes * 60000);
  const breakLimit = useRef(breakMinutes * 60000);
  const workTarget = useRef(workMinutes * 60000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wl = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) wl.current = await navigator.wakeLock.request("screen");
    } catch {}
  }, []);

  useEffect(() => {
    const fn = () => {
      if (wl.current && document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [requestWakeLock]);

  const tick = useCallback(() => {
    const now = Date.now();
    if (intervalsRef.current) {
      if (isWork.current) {
        const cur = workMs.current + (now - phaseStart.current);
        if (cur >= workTarget.current) {
          const roll = cur - workTarget.current;
          workMs.current = workTarget.current;
          workTarget.current += workInterval.current;
          breakMs.current = 0;
          phaseStart.current = now - roll;
          isWork.current = false;
          setIsWorkPhase(false);
          setWorkDisplay(formatTime(workMs.current));
          setBreakDisplay(formatTime(roll));
          setWorkClass("inactive-top");
          setBreakClass("active");
          vibrate([200, 100, 200, 100, 200]);
        } else {
          setWorkDisplay(formatTime(cur));
        }
      } else {
        const cur = breakMs.current + (now - phaseStart.current);
        if (cur >= breakLimit.current) {
          const roll = cur - breakLimit.current;
          breakMs.current = 0;
          phaseStart.current = now - roll;
          isWork.current = true;
          setIsWorkPhase(true);
          setWorkDisplay(formatTime(workMs.current + roll));
          setBreakClass("inactive-bottom");
          setWorkClass("active");
          vibrate([600, 200, 600]);
        } else {
          setBreakDisplay(formatTime(cur));
        }
      }
    } else {
      setWorkDisplay(formatTime(workMs.current + (now - phaseStart.current)));
    }
  }, []);

  const start = useCallback(() => {
    requestWakeLock();
    phaseStart.current = Date.now();
    timerRef.current = setInterval(tick, 100);
    setIsRunning(true);
  }, [tick, requestWakeLock]);

  const pause = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const now = Date.now();
    if (isWork.current || !intervalsRef.current)
      workMs.current += now - phaseStart.current;
    else breakMs.current += now - phaseStart.current;
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (isRunning) pause(); else start();
  }, [isRunning, pause, start]);

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setIsWorkPhase(true);
    isWork.current = true;
    workMs.current = 0;
    breakMs.current = 0;
    phaseStart.current = 0;
    workTarget.current = workInterval.current;
    setWorkDisplay("00:00");
    setBreakDisplay("00:00");
    setWorkClass("active");
    setBreakClass("inactive-bottom");
  }, []);

  const openIntervals = useCallback(() => {
    setModalIntervals(intervalsEnabled);
    if (workIn.current) workIn.current.value = String(workMinutes);
    if (breakIn.current) breakIn.current.value = String(breakMinutes);
    setIntervalsOpen(true);
  }, [intervalsEnabled, workMinutes, breakMinutes]);

  const saveIntervals = useCallback(() => {
    const nw = parseInt(workIn.current?.value ?? "40");
    const nb = parseInt(breakIn.current?.value ?? "5");
    if (!isNaN(nw) && nw > 0 && !isNaN(nb) && nb > 0) {
      setWorkMinutes(nw);
      setBreakMinutes(nb);
      setIntervalsEnabled(modalIntervals);
      workInterval.current = nw * 60000;
      breakLimit.current = nb * 60000;
      intervalsRef.current = modalIntervals;
    }
    setIntervalsOpen(false);
    reset();
  }, [modalIntervals, reset]);

  const saveCustom = () => {
    const id = `c-${Date.now()}`;
    const label = newLabel.trim() || `Theme ${customs.length + 1}`;
    const next = [...customs, { id, bg: newBg, text: newText, label }];
    setCustoms(next);
    setThemeKey(id);
    setAddOpen(false);
    setThemeOpen(false);
    setNewLabel("");
  };

  const deleteCustom = (id: string) => {
    const next = customs.filter((t) => t.id !== id);
    setCustoms(next);
    if (themeKey === id) setThemeKey("system");
  };

  const ring = `${theme.text}18`;
  const subtle = `${theme.text}09`;

  const builtinThemes = [
    {
      key: "system" as BuiltinKey,
      label: "System",
      preview: dark ? { bg: "#000", text: "#fff" } : { bg: "#fff", text: "#000" },
      isSystem: true,
    },
    {
      key: "black" as BuiltinKey,
      label: "Black",
      preview: { bg: "#000000", text: "#FFFFFF" },
      isSystem: false,
    },
  ];

  return (
    <div
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
        height: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        overflow: "hidden",
        transition: "background-color 0.35s ease, color 0.35s ease",
        position: "relative",
      }}
    >
      {/* Clock face — tap to open intervals */}
      <div
        className="display-wrapper"
        onClick={openIntervals}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div className={`time-display ${workClass}`} style={{ color: theme.text }}>
          {workDisplay}
        </div>
        <div className={`time-display ${breakClass}`} style={{ color: theme.text }}>
          {breakDisplay}
        </div>
      </div>

      {/* ── Corner buttons ── */}
      <Btn
        pos={{ top: "30px", left: "30px" }}
        onClick={(e) => {
          e.stopPropagation();
          setThemeOpen(true);
          setAddOpen(false);
        }}
        text={theme.text}
        bg={subtle}
        title="Appearance"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 7.38 16.75A9.96 9.96 0 0 0 12 12V2z" />
        </svg>
      </Btn>

      <Btn
        pos={{ top: "30px", right: "30px" }}
        onClick={(e) => {
          e.stopPropagation();
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
          else document.exitFullscreen();
        }}
        text={theme.text}
        bg={subtle}
        title="Fullscreen"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </Btn>

      <Btn
        pos={{ bottom: "30px", left: "30px" }}
        onClick={(e) => { e.stopPropagation(); reset(); }}
        text={theme.text}
        bg={subtle}
        title="Reset"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </Btn>

      <Btn
        pos={{ bottom: "30px", right: "30px" }}
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        text={theme.text}
        bg={subtle}
        title={isRunning ? "Pause" : "Start"}
      >
        {isRunning ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        )}
      </Btn>

      {/* ── Theme sheet ── */}
      {themeOpen && (
        <Sheet onClose={() => { setThemeOpen(false); setAddOpen(false); }} theme={theme}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
            <span style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px" }}>Appearance</span>
            <button
              onClick={() => { setThemeOpen(false); setAddOpen(false); }}
              style={{ background: "none", border: "none", color: theme.text, opacity: 0.45, cursor: "pointer", fontSize: "22px", lineHeight: 1, padding: "0 2px" }}
            >×</button>
          </div>

          {/* swatches row */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
            {builtinThemes.map(({ key, label, preview, isSystem }) => {
              const active = themeKey === key;
              return (
                <button
                  key={key}
                  onClick={() => { setThemeKey(key); setThemeOpen(false); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: 0, display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
                  }}
                >
                  <span style={{
                    width: "64px", height: "44px", borderRadius: "12px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "13px", fontWeight: 600, letterSpacing: "-0.5px",
                    background: isSystem
                      ? `linear-gradient(135deg, ${preview.bg} 50%, ${preview.text} 50%)`
                      : preview.bg,
                    color: preview.text,
                    outline: active ? `2.5px solid ${theme.text}` : `1.5px solid ${ring}`,
                    outlineOffset: "2px",
                    transition: "outline 0.15s",
                  }}>
                    {!isSystem && <span style={{ fontSize: "11px", opacity: 0.7, fontWeight: 500 }}>Aa</span>}
                  </span>
                  <span style={{ fontSize: "12px", opacity: active ? 1 : 0.5, fontWeight: active ? 600 : 400, color: theme.text }}>
                    {label}
                  </span>
                </button>
              );
            })}

            {/* custom swatches */}
            {customs.map((ct) => {
              const active = themeKey === ct.id;
              return (
                <div key={ct.id} style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", position: "relative" }}>
                  <button
                    onClick={() => { setThemeKey(ct.id); setThemeOpen(false); }}
                    style={{
                      background: ct.bg, border: "none", cursor: "pointer", padding: 0,
                      width: "64px", height: "44px", borderRadius: "12px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      outline: active ? `2.5px solid ${theme.text}` : `1.5px solid ${ring}`,
                      outlineOffset: "2px",
                      transition: "outline 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: ct.text, opacity: 0.7, fontWeight: 500 }}>Aa</span>
                  </button>
                  <span style={{ fontSize: "12px", opacity: active ? 1 : 0.5, fontWeight: active ? 600 : 400, color: theme.text, maxWidth: "64px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ct.label}
                  </span>
                  {/* delete badge */}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCustom(ct.id); }}
                    style={{
                      position: "absolute", top: "-6px", right: "-6px",
                      width: "18px", height: "18px", borderRadius: "50%",
                      background: theme.text, color: theme.bg,
                      border: "none", cursor: "pointer",
                      fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, lineHeight: 1,
                    }}
                  >×</button>
                </div>
              );
            })}

            {/* add swatch */}
            {!addOpen && (
              <button
                onClick={() => setAddOpen(true)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
                }}
              >
                <span style={{
                  width: "64px", height: "44px", borderRadius: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1.5px dashed ${theme.text}`,
                  opacity: 0.4, fontSize: "20px", color: theme.text,
                }}>+</span>
                <span style={{ fontSize: "12px", opacity: 0.4, color: theme.text }}>Add</span>
              </button>
            )}
          </div>

          {/* ── Add theme form ── */}
          {addOpen && (
            <div style={{
              borderRadius: "16px",
              border: `1px solid ${ring}`,
              padding: "20px",
              marginTop: "4px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, opacity: 0.9 }}>New theme</span>
                {/* live mini-preview */}
                <span style={{
                  background: newBg,
                  color: newText,
                  borderRadius: "8px",
                  padding: "4px 10px",
                  fontSize: "13px",
                  fontWeight: 700,
                  border: `1px solid ${ring}`,
                  letterSpacing: "-0.5px",
                }}>00:00</span>
              </div>

              {/* Name */}
              <div style={{ marginBottom: "16px" }}>
                <p style={labelStyle(theme.text)}>Name (optional)</p>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={`Theme ${customs.length + 1}`}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: "10px",
                    border: `1px solid ${ring}`,
                    background: subtle, color: theme.text,
                    fontSize: "14px", fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Color rows */}
              <ColorRow label="Background" value={newBg} onChange={setNewBg} textColor={theme.text} ring={ring} subtle={subtle} />
              <ColorRow label="Text" value={newText} onChange={setNewText} textColor={theme.text} ring={ring} subtle={subtle} />

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button
                  onClick={() => setAddOpen(false)}
                  style={{
                    flex: 1, padding: "12px", borderRadius: "12px",
                    border: `1px solid ${ring}`,
                    background: "none", color: theme.text,
                    fontSize: "14px", fontWeight: 500, cursor: "pointer",
                  }}
                >Cancel</button>
                <button
                  onClick={saveCustom}
                  style={{
                    flex: 1, padding: "12px", borderRadius: "12px",
                    border: "none",
                    background: theme.text, color: theme.bg,
                    fontSize: "14px", fontWeight: 600, cursor: "pointer",
                  }}
                >Save theme</button>
              </div>
            </div>
          )}
        </Sheet>
      )}

      {/* ── Intervals modal ── */}
      {intervalsOpen && (
        <div
          onClick={() => setIntervalsOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)",
            display: "flex", justifyContent: "center", alignItems: "center", zIndex: 30,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.bg, color: theme.text,
              padding: "32px", borderRadius: "24px",
              width: "90%", maxWidth: "320px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
              border: `1px solid ${ring}`,
            }}
          >
            <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "28px", textAlign: "center", letterSpacing: "-0.3px" }}>
              Intervals
            </h2>

            <div style={rowStyle}>
              <label style={{ fontSize: "15px", fontWeight: 400 }}>Enable intervals</label>
              <Toggle checked={modalIntervals} onChange={setModalIntervals} bg={theme.bg} text={theme.text} />
            </div>

            <div style={{ opacity: modalIntervals ? 1 : 0.3, pointerEvents: modalIntervals ? "auto" : "none", transition: "opacity 0.25s" }}>
              <div style={rowStyle}>
                <label style={{ fontSize: "15px", fontWeight: 400 }}>Work (min)</label>
                <input ref={workIn} type="number" defaultValue={workMinutes} min="1"
                  style={numInput(theme.text, subtle, ring)} />
              </div>
              <div style={{ ...rowStyle, marginBottom: 0 }}>
                <label style={{ fontSize: "15px", fontWeight: 400 }}>Break (min)</label>
                <input ref={breakIn} type="number" defaultValue={breakMinutes} min="1"
                  style={numInput(theme.text, subtle, ring)} />
              </div>
            </div>

            <button
              onClick={saveIntervals}
              style={{
                width: "100%", padding: "15px", borderRadius: "14px",
                border: "none", backgroundColor: theme.text, color: theme.bg,
                fontSize: "15px", fontWeight: 600, marginTop: "28px", cursor: "pointer",
                letterSpacing: "-0.2px",
              }}
            >Save</button>
          </div>
        </div>
      )}

      <style>{`
        .time-display {
          position: absolute;
          font-size: min(38vw, 60vh);
          font-weight: 200;
          line-height: 1;
          text-align: center;
          user-select: none;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.03em;
          transition: transform 0.85s cubic-bezier(0.16,1,0.3,1), opacity 0.85s cubic-bezier(0.16,1,0.3,1);
          will-change: transform, opacity;
          pointer-events: none;
        }
        .time-display.active        { transform: translateY(0) scale(1); opacity: 1; }
        .time-display.inactive-top  { transform: translateY(-32vh) scale(0.22); opacity: 0.3; }
        .time-display.inactive-bottom { transform: translateY(15vh) scale(0.6); opacity: 0; }
        .display-wrapper:active .time-display.active {
          opacity: 0.5;
          transform: translateY(0) scale(0.98);
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Btn({
  children, onClick, text, bg, pos, title,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  text: string; bg: string;
  pos: React.CSSProperties;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        position: "fixed", ...pos,
        backgroundColor: bg, color: text,
        border: "none", width: "40px", height: "40px",
        borderRadius: "50%", display: "flex",
        justifyContent: "center", alignItems: "center",
        cursor: "pointer", backdropFilter: "blur(4px)",
        transition: "opacity 0.2s", WebkitTapHighlightColor: "transparent",
        zIndex: 10,
      }}
    >
      {children}
    </button>
  );
}

function Sheet({
  children, onClose, theme,
}: {
  children: React.ReactNode;
  onClose: () => void;
  theme: { bg: string; text: string };
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: theme.bg,
          borderRadius: "28px 28px 0 0",
          padding: "12px 24px 40px",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "85vh",
          overflowY: "auto",
          animation: "slideUp 0.32s cubic-bezier(0.16,1,0.3,1)",
          boxSizing: "border-box",
        }}
      >
        {/* drag handle */}
        <div style={{
          width: "36px", height: "4px", borderRadius: "2px",
          background: `${theme.text}25`,
          margin: "0 auto 24px",
        }} />
        {children}
      </div>
    </div>
  );
}

function ColorRow({
  label, value, onChange, textColor, ring, subtle,
}: {
  label: string; value: string; onChange: (v: string) => void;
  textColor: string; ring: string; subtle: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <span style={{ fontSize: "14px", color: textColor, opacity: 0.7, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{
          fontFamily: "monospace", fontSize: "13px",
          color: textColor, opacity: 0.6,
          background: subtle, border: `1px solid ${ring}`,
          borderRadius: "8px", padding: "5px 10px",
        }}>{value.toUpperCase()}</span>
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: value, border: `1.5px solid ${ring}`,
            cursor: "pointer", flexShrink: 0,
          }}
        />
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
        />
      </div>
    </div>
  );
}

function Toggle({
  checked, onChange, bg, text,
}: {
  checked: boolean; onChange: (v: boolean) => void;
  bg: string; text: string;
}) {
  return (
    <label style={{ position: "relative", display: "inline-block", width: "48px", height: "28px", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{
        position: "absolute", inset: 0,
        backgroundColor: checked ? text : `${text}22`,
        borderRadius: "28px",
        border: `1.5px solid ${text}`,
        transition: "background-color 0.25s",
      }}>
        <span style={{
          position: "absolute",
          width: "18px", height: "18px", borderRadius: "50%",
          top: "3px", left: checked ? "23px" : "3px",
          backgroundColor: checked ? bg : text,
          transition: "left 0.25s",
          display: "block",
        }} />
      </span>
    </label>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between",
  alignItems: "center", marginBottom: "22px",
};

function labelStyle(color: string): React.CSSProperties {
  return { fontSize: "11px", fontWeight: 600, letterSpacing: "0.8px", opacity: 0.45, marginBottom: "8px", color, textTransform: "uppercase" };
}

function numInput(text: string, bg: string, border: string): React.CSSProperties {
  return {
    background: bg, color: text, border: `1px solid ${border}`,
    borderRadius: "10px", padding: "8px 14px",
    width: "72px", fontSize: "15px",
    textAlign: "center", fontFamily: "inherit", outline: "none",
  };
}

