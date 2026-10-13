import { type Dispatch, useEffect, useReducer, useRef, useState } from "react";
import {
  AREAS,
  areaFor,
  BRANCHES,
  canBuyNode,
  canRetire,
  freeName,
  gearCost,
  HERO_NAMES,
  MAX_PARTY,
  power,
  recruitCost,
  renownFor,
  SLOTS,
  TIER_NAMES,
  TREE,
} from "./economy";
import { type Action, reducer, type State } from "./game";
import { meta } from "./meta";
import { BASE_W, drawScene, H, type SceneInput } from "./scene";
import { HERO_CLASSES, type HeroClass } from "./sprites";
import { load, save } from "./storage";
import {
  DURATION_CHOICES,
  elapsedAt,
  isRunning,
  isUntouched,
  LONG_EVERY,
  type Phase,
  remainingAt,
} from "./timer";
import "./quest.css";

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
  const { timer, durations, run } = s;
  const focus = timer.phase === "focus";
  return {
    mode: focus ? (isUntouched(timer, durations) ? "idle" : "quest") : "camp",
    sky: focus ? "day" : timer.phase === "short" ? "dusk" : "night",
    storyMs: elapsedAt(timer, durations, now),
    party: run.heroes,
    paused: !isRunning(timer),
    fightMs: run.fightMs,
    area: areaFor(power(run.heroes)),
  };
}

/** Canvas sizes, in scene pixels, that the stage may stretch to. */
const MIN_W = 160;
const MAX_W = 480;
const MAX_H = 260;

function Scene({ state }: { state: State }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(state);
  const [size, setSize] = useState({ w: BASE_W, h: H });
  useEffect(() => {
    live.current = state;
  }, [state]);

  // Match the canvas to the stage's shape: a wide window shows more desert, a tall one more sky.
  useEffect(() => {
    const stage = canvas.current?.parentElement;
    if (!stage) return;
    const fit = () => {
      const { width: w, height: h } = stage.getBoundingClientRect();
      if (w <= 0 || h <= 0) return;
      const cw = Math.min(MAX_W, Math.max(MIN_W, Math.round((H * w) / h)));
      const ch = Math.min(MAX_H, Math.max(H, Math.round((cw * h) / w)));
      setSize((s) => (s.w === cw && s.h === ch ? s : { w: cw, h: ch }));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

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
      width={size.w}
      height={size.h}
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A name picked from the list; a name from an older save stays selectable. */
function NameSelect(props: { label: string; value: string; onChange: (name: string) => void }) {
  const names = HERO_NAMES.includes(props.value) ? HERO_NAMES : [props.value, ...HERO_NAMES];
  return (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {names.map((n) => (
        <option key={n} value={n}>
          {n || "(no name)"}
        </option>
      ))}
    </select>
  );
}

function Party({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const { run, legacy } = state;
  const gold = Math.floor(run.gold);
  const taken = new Set(run.heroes.map((h) => h.cls));
  const [pickedCls, setCls] = useState<HeroClass | null>(null);
  const cls = pickedCls ?? HERO_CLASSES.find((c) => !taken.has(c)) ?? "knight";
  const [picked, setName] = useState<string | null>(null);
  const name = picked ?? freeName(run.heroes);
  const cost = recruitCost(run.heroes, legacy.owned);

  return (
    <section className="quest-section">
      <h2>Party</h2>
      {run.heroes.map((h, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: party slots are positional
        <div key={i} className="quest-member">
          <NameSelect
            label={`Hero ${i + 1} name`}
            value={h.name}
            onChange={(name) => dispatch({ type: "rename", hero: i, name })}
          />
          <span className="quest-class">{h.cls}</span>
          <div className="quest-gear-row">
            {SLOTS.map((slot) => {
              const price = gearCost(h, slot);
              return (
                <button
                  key={slot}
                  type="button"
                  className="quest-gear"
                  disabled={price === null || gold < price}
                  onClick={() => dispatch({ type: "buyGear", hero: i, slot })}
                  title={price === null ? "Fully upgraded" : `Upgrade for ${price} gold`}
                >
                  {capitalize(TIER_NAMES[h[slot]] ?? "")} {slot}
                  {price !== null && <small> · {price}g</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {cost !== null && run.heroes.length < MAX_PARTY && (
        <div className="quest-member quest-recruit">
          <NameSelect label="New hero name" value={name} onChange={setName} />
          <select
            aria-label="New hero class"
            value={cls}
            onChange={(e) => {
              const c = HERO_CLASSES.find((x): x is HeroClass => x === e.target.value);
              if (c) setCls(c);
            }}
          >
            {HERO_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={gold < cost}
            onClick={() => {
              dispatch({ type: "recruit", name, cls });
              setName(null);
              setCls(null);
            }}
          >
            Recruit · {cost}g
          </button>
        </div>
      )}
    </section>
  );
}

function Renown({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const { run, legacy, timer } = state;
  const [confirming, setConfirming] = useState(false);
  const ready = canRetire(run.heroes);
  const gain = renownFor(run.runGold);
  const nextArea = AREAS[1];

  return (
    <section className="quest-section">
      <h2>Renown · {legacy.renown} to spend</h2>
      <p className="quest-note">
        {ready
          ? `Retiring now ends this run and earns ${gain} renown. Gold, gear and recruits start over.`
          : `Reach the ${nextArea?.name.toLowerCase() ?? "next area"} (power ${nextArea?.unlockPower ?? 0}) to be able to retire the party.`}
        {legacy.retirements > 0 &&
          ` Retired ${legacy.retirements} ${legacy.retirements === 1 ? "time" : "times"} so far.`}
      </p>
      {ready && (
        <div className="quest-buttons">
          {confirming ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={isRunning(timer)}
                onClick={() => {
                  dispatch({ type: "retire" });
                  setConfirming(false);
                }}
              >
                Retire for {gain} renown
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Keep going
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={isRunning(timer)}
              title={isRunning(timer) ? "Pause the timer first" : undefined}
              onClick={() => setConfirming(true)}
            >
              Retire the party…
            </button>
          )}
        </div>
      )}
      <div className="quest-tree">
        {BRANCHES.map((branch) => (
          <div key={branch} className="quest-branch">
            <span className="quest-branch-name">{branch}</span>
            {TREE.filter((n) => n.branch === branch).map((node) => {
              const owned = legacy.owned.includes(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  aria-pressed={owned}
                  disabled={owned || !canBuyNode(legacy, node)}
                  onClick={() => dispatch({ type: "buyNode", id: node.id })}
                >
                  {node.name}
                  {!owned && <small> · {node.cost}</small>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function TimerSettings({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const { durations } = state;
  const setDuration = (phase: Phase, value: string) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
      dispatch({ type: "durations", durations: { ...durations, [phase]: n } });
    }
  };
  return (
    <fieldset className="quest-durations">
      <legend>Minutes</legend>
      {(
        [
          ["focus", "Quest"],
          ["short", "Rest"],
          ["long", "Long rest"],
        ] as const
      ).map(([phase, name]) => (
        <label
          key={phase}
          title={phase === "long" ? `After every ${LONG_EVERY} quests` : undefined}
        >
          {name}
          <select value={durations[phase]} onChange={(e) => setDuration(phase, e.target.value)}>
            {[...new Set([...DURATION_CHOICES[phase], durations[phase]])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...load(Date.now()),
    chimes: 0,
    event: null,
  }));
  const [now, setNow] = useState(Date.now);
  const [drawer, setDrawer] = useState(false);
  const { timer, durations, stats, run, legacy } = state;

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    save({ durations, timer, stats, run, legacy });
  }, [durations, timer, stats, run, legacy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const label = timer.phase === "focus" && untouched ? "Ready to set out" : LABELS[timer.phase];
  const go = timer.phase === "focus" ? "Set out" : "Make camp";
  const p = power(run.heroes);
  const area = AREAS[areaFor(p)] ?? AREAS[0];
  const gold = Math.floor(run.gold);

  return (
    <div className="quest">
      <div className="quest-stage">
        <Scene state={state} />
        <div className="quest-hud">
          <span>
            <strong>{gold}</strong> gold
          </span>
          <span>power {p}</span>
          <span>{area.name}</span>
        </div>
        <div className="quest-toasts" aria-live="polite">
          {state.event && (
            <div key={state.event.id} className="quest-toast">
              {state.event.text}
            </div>
          )}
        </div>
      </div>

      <div className="quest-bar">
        <div className="quest-time">
          <div className="quest-label">{label}</div>
          <div className="quest-clock">{clock(remaining)}</div>
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
        <TimerSettings state={state} dispatch={dispatch} />
        <button
          type="button"
          className="quest-drawer-toggle"
          aria-expanded={drawer}
          aria-controls="quest-drawer"
          onClick={() => setDrawer((d) => !d)}
        >
          Party &amp; renown
        </button>
      </div>

      <aside id="quest-drawer" className="quest-drawer" data-open={drawer} inert={!drawer}>
        <header className="quest-drawer-head">
          <h2>Party &amp; renown</h2>
          <button type="button" onClick={() => setDrawer(false)}>
            Close
          </button>
        </header>
        <p className="quest-stats">
          <strong>{gold} gold</strong> · power {p} · {area.name}
          <br />
          Today: {stats.quests} {stats.quests === 1 ? "quest" : "quests"} · {stats.foes} foes felled
          · {stats.totalFoes} all time
        </p>
        <Party state={state} dispatch={dispatch} />
        <Renown state={state} dispatch={dispatch} />
      </aside>
    </div>
  );
}
