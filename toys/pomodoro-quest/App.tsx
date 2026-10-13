import { useEffect, useReducer, useRef, useState } from "react";
import { meta } from "./meta";
import { drawScene, foesFelled, H, type Member, type SceneInput, W } from "./scene";
import { HERO_CLASSES, type HeroClass } from "./sprites";
import { DEFAULT_PARTY, load, type Saved, save, today } from "./storage";
import {
  advance,
  type Durations,
  elapsedAt,
  freshTimer,
  isRunning,
  isUntouched,
  LONG_EVERY,
  type Phase,
  pause,
  phaseMs,
  remainingAt,
  start,
} from "./timer";
import "./quest.css";

interface State extends Saved {
  /** Bumped each time a phase runs out, so the chime plays once per finish. */
  chimes: number;
}

type Action =
  | { type: "tick"; now: number }
  | { type: "toggle"; now: number }
  | { type: "skip" }
  | { type: "restart" }
  | { type: "durations"; durations: Durations }
  | { type: "party"; party: Member[] };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "tick": {
      const day = today(a.now);
      if (s.stats.day !== day) s = { ...s, stats: { ...s.stats, day, quests: 0, foes: 0 } };
      const t = s.timer;
      if (t.endsAt === null || a.now < t.endsAt) return s;
      let stats = s.stats;
      if (t.phase === "focus") {
        const foes = foesFelled(phaseMs("focus", s.durations));
        stats = {
          ...stats,
          quests: stats.quests + 1,
          foes: stats.foes + foes,
          totalFoes: stats.totalFoes + foes,
        };
      }
      return { ...s, stats, timer: advance(t, s.durations, true), chimes: s.chimes + 1 };
    }
    case "toggle":
      return { ...s, timer: isRunning(s.timer) ? pause(s.timer, a.now) : start(s.timer, a.now) };
    case "skip":
      return { ...s, timer: advance(s.timer, s.durations, false) };
    case "restart":
      return { ...s, timer: freshTimer(s.timer.phase, s.durations, s.timer.streak) };
    case "durations": {
      const t = s.timer;
      const timer = isUntouched(t, s.durations)
        ? freshTimer(t.phase, a.durations, t.streak)
        : { ...t, remaining: Math.min(t.remaining, phaseMs(t.phase, a.durations)) };
      return { ...s, durations: a.durations, timer };
    }
    case "party":
      return { ...s, party: a.party };
  }
}

let audio: AudioContext | null = null;

/** Browsers only allow sound after a click, so the first click creates the audio context. */
function unlockAudio() {
  audio ??= new AudioContext();
  void audio.resume();
}

function chime() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [659, 784, 988].forEach((freq, i) => {
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = t0 + i * 0.16;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

function sceneInput(s: State, now: number): SceneInput {
  const { timer, durations } = s;
  const focus = timer.phase === "focus";
  return {
    mode: focus ? (isUntouched(timer, durations) ? "idle" : "quest") : "camp",
    sky: focus ? "day" : timer.phase === "short" ? "dusk" : "night",
    storyMs: elapsedAt(timer, durations, now),
    party: s.party,
    paused: !isRunning(timer),
  };
}

function Scene({ state }: { state: State }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(state);
  useEffect(() => {
    live.current = state;
  }, [state]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    const loop = () => {
      drawScene(ctx, sceneInput(live.current, Date.now()), performance.now());
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={canvas}
      className="quest-scene"
      width={W}
      height={H}
      role="img"
      aria-label="Your party on its quest"
    />
  );
}

const LABELS: Record<Phase, string> = {
  focus: "On the road",
  short: "Resting at camp",
  long: "A long rest under the stars",
};

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  return `${String(m).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...load(Date.now()),
    chimes: 0,
  }));
  const [now, setNow] = useState(Date.now);
  const { timer, durations, stats, party } = state;

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    save({ durations, timer, stats, party });
  }, [durations, timer, stats, party]);

  const heard = useRef(state.chimes);
  useEffect(() => {
    if (state.chimes === heard.current) return;
    heard.current = state.chimes;
    chime();
  }, [state.chimes]);

  const running = isRunning(timer);
  const untouched = isUntouched(timer, durations);
  const remaining = remainingAt(timer, now);

  useEffect(() => {
    document.title = running ? `${clock(remaining)} · ${meta.title}` : `${meta.title} · epicurus`;
  }, [running, remaining]);

  const liveFoes =
    timer.phase === "focus" && !untouched ? foesFelled(elapsedAt(timer, durations, now)) : 0;
  const label = timer.phase === "focus" && untouched ? "Ready to set out" : LABELS[timer.phase];
  const go = timer.phase === "focus" ? "Set out" : "Make camp";

  const setSize = (n: number) => {
    const next = party.slice(0, n);
    for (let i = next.length; i < n; i++) {
      const m = DEFAULT_PARTY[i];
      if (m) next.push(m);
    }
    dispatch({ type: "party", party: next });
  };
  const setMember = (i: number, m: Member) =>
    dispatch({ type: "party", party: party.map((p, j) => (j === i ? m : p)) });
  const setDuration = (phase: Phase, value: string) => {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n >= 1 && n <= 120) {
      dispatch({ type: "durations", durations: { ...durations, [phase]: n } });
    }
  };

  return (
    <div className="quest">
      <Scene state={state} />

      <div className="quest-timer">
        <div>
          <div className="quest-label">{label}</div>
          <div className="quest-clock" aria-live="off">
            {clock(remaining)}
          </div>
          <div className="quest-pips" title="Focus sessions until a long rest">
            {Array.from({ length: LONG_EVERY }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length row of pips
              <span key={i} className={i < timer.streak ? "on" : ""} />
            ))}
          </div>
        </div>
        <div className="quest-buttons">
          <button
            type="button"
            className="primary"
            onClick={() => {
              unlockAudio();
              dispatch({ type: "toggle", now: Date.now() });
            }}
          >
            {running ? "Pause" : untouched ? go : "Resume"}
          </button>
          <button type="button" onClick={() => dispatch({ type: "skip" })}>
            Skip
          </button>
          <button type="button" onClick={() => dispatch({ type: "restart" })} disabled={untouched}>
            Restart
          </button>
        </div>
      </div>

      <p className="quest-stats">
        Today: {stats.quests} {stats.quests === 1 ? "quest" : "quests"} · {stats.foes + liveFoes}{" "}
        foes felled · {stats.totalFoes + liveFoes} all time
      </p>

      <details className="quest-settings">
        <summary>Party</summary>
        <fieldset className="quest-size">
          <legend>Size</legend>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={party.length === n}
              onClick={() => setSize(n)}
            >
              {n}
            </button>
          ))}
        </fieldset>
        {party.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: party slots are positional
          <div key={i} className="quest-member">
            <input
              aria-label={`Member ${i + 1} name`}
              value={m.name}
              maxLength={16}
              onChange={(e) => setMember(i, { ...m, name: e.target.value })}
            />
            <select
              aria-label={`Member ${i + 1} class`}
              value={m.cls}
              onChange={(e) => {
                const cls = HERO_CLASSES.find((c): c is HeroClass => c === e.target.value);
                if (cls) setMember(i, { ...m, cls });
              }}
            >
              {HERO_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ))}
      </details>

      <details className="quest-settings">
        <summary>Timer</summary>
        {(
          [
            ["focus", "Quest"],
            ["short", "Short rest"],
            ["long", "Long rest"],
          ] as const
        ).map(([phase, name]) => (
          <label key={phase} className="quest-duration">
            {name}
            <input
              type="number"
              min={1}
              max={120}
              value={durations[phase]}
              onChange={(e) => setDuration(phase, e.target.value)}
            />
            min
          </label>
        ))}
        <p className="quest-note">A long rest comes after every {LONG_EVERY} quests.</p>
      </details>
    </div>
  );
}
