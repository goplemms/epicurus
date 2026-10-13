import { type Dispatch, useEffect, useReducer, useRef, useState } from "react";
import {
  AREAS,
  areaFor,
  BRANCHES,
  canBuyNode,
  canRetire,
  gearCost,
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
import { drawScene, H, type SceneInput, W } from "./scene";
import { HERO_CLASSES, type HeroClass } from "./sprites";
import { load, save } from "./storage";
import { elapsedAt, isRunning, isUntouched, LONG_EVERY, type Phase, remainingAt } from "./timer";
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Party({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const { run, legacy } = state;
  const gold = Math.floor(run.gold);
  const taken = new Set(run.heroes.map((h) => h.cls));
  const [cls, setCls] = useState<HeroClass>(
    () => HERO_CLASSES.find((c) => !taken.has(c)) ?? "knight",
  );
  const [name, setName] = useState("");
  const cost = recruitCost(run.heroes, legacy.owned);

  return (
    <details className="quest-settings" open>
      <summary>Party</summary>
      {run.heroes.map((h, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: party slots are positional
        <div key={i} className="quest-member">
          <input
            aria-label={`Hero ${i + 1} name`}
            value={h.name}
            maxLength={16}
            onChange={(e) => dispatch({ type: "rename", hero: i, name: e.target.value })}
          />
          <span className="quest-class">{h.cls}</span>
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
      ))}
      {cost !== null && run.heroes.length < MAX_PARTY && (
        <div className="quest-member quest-recruit">
          <input
            aria-label="New hero name"
            placeholder="New hero"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
          />
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
              dispatch({ type: "recruit", name: name || capitalize(cls), cls });
              setName("");
            }}
          >
            Recruit · {cost}g
          </button>
        </div>
      )}
    </details>
  );
}

function Renown({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const { run, legacy, timer } = state;
  const [confirming, setConfirming] = useState(false);
  const ready = canRetire(run.heroes);
  const gain = renownFor(run.runGold);
  const nextArea = AREAS[1];

  return (
    <details className="quest-settings">
      <summary>Renown · {legacy.renown} to spend</summary>
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
    </details>
  );
}

function TimerSettings({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const { durations } = state;
  const setDuration = (phase: Phase, value: string) => {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n >= 1 && n <= 120) {
      dispatch({ type: "durations", durations: { ...durations, [phase]: n } });
    }
  };
  return (
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
  );
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...load(Date.now()),
    chimes: 0,
    event: null,
  }));
  const [now, setNow] = useState(Date.now);
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

      <p className="quest-purse">
        <strong>{Math.floor(run.gold)} gold</strong> · power {p} · {area.name}
      </p>
      <p className="quest-stats">
        Today: {stats.quests} {stats.quests === 1 ? "quest" : "quests"} · {stats.foes} foes felled ·{" "}
        {stats.totalFoes} all time
      </p>
      <p className="quest-event" aria-live="polite">
        {state.event ?? ""}
      </p>

      <Party state={state} dispatch={dispatch} />
      <Renown state={state} dispatch={dispatch} />
      <TimerSettings state={state} dispatch={dispatch} />
    </div>
  );
}
