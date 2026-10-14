export type Phase = "focus" | "short" | "long";

/** Phase lengths in minutes. */
export interface Durations {
  focus: number;
  short: number;
  long: number;
}

export interface TimerState {
  phase: Phase;
  /** Epoch ms the phase ends at, while running; null while paused or not started. */
  endsAt: number | null;
  /** Ms left in the phase, while paused or not started. */
  remaining: number;
  /** Focus sessions finished since the last long rest. */
  streak: number;
}

/** A long rest comes after this many focus sessions. */
export const LONG_EVERY = 4;

export const DEFAULT_DURATIONS: Durations = { focus: 25, short: 5, long: 15 };

/** The lengths offered for each phase, in minutes. */
export const DURATION_CHOICES: Record<Phase, readonly number[]> = {
  focus: [15, 20, 25, 30, 40, 45, 50, 60],
  short: [3, 5, 10, 15],
  long: [10, 15, 20, 25, 30],
};

export function phaseMs(phase: Phase, d: Durations): number {
  return d[phase] * 60_000;
}

export function freshTimer(phase: Phase, d: Durations, streak: number): TimerState {
  return { phase, endsAt: null, remaining: phaseMs(phase, d), streak };
}

export function remainingAt(t: TimerState, now: number): number {
  return t.endsAt === null ? t.remaining : Math.max(0, t.endsAt - now);
}

export function elapsedAt(t: TimerState, d: Durations, now: number): number {
  return Math.max(0, phaseMs(t.phase, d) - remainingAt(t, now));
}

export function isRunning(t: TimerState): boolean {
  return t.endsAt !== null;
}

/** True before the phase has been started at all. */
export function isUntouched(t: TimerState, d: Durations): boolean {
  return t.endsAt === null && t.remaining === phaseMs(t.phase, d);
}

export function start(t: TimerState, now: number): TimerState {
  return t.endsAt === null ? { ...t, endsAt: now + t.remaining } : t;
}

export function pause(t: TimerState, now: number): TimerState {
  return t.endsAt === null ? t : { ...t, endsAt: null, remaining: remainingAt(t, now) };
}

/** Moves to the next phase. Only a finished focus session counts toward the long rest. */
export function advance(t: TimerState, d: Durations, finished: boolean): TimerState {
  if (t.phase !== "focus") return freshTimer("focus", d, t.phase === "long" ? 0 : t.streak);
  const streak = finished ? t.streak + 1 : t.streak;
  return freshTimer(streak >= LONG_EVERY ? "long" : "short", d, streak);
}
