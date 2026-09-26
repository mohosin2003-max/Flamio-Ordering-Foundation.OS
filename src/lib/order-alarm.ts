/**
 * Browser-only order sounds: the Kitchen single beep and the repeating
 * dashboard New Order Alarm. Settings are stored on this device only.
 */

const SETTINGS_KEY = "flamio.order-alarm.v1";

export type OrderAlarmSettings = { enabled: boolean; volume: number; intervalSec: number };
export const DEFAULT_ALARM_SETTINGS: OrderAlarmSettings = { enabled: true, volume: 0.6, intervalSec: 3 };

export function readAlarmSettings(): OrderAlarmSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_ALARM_SETTINGS, ...JSON.parse(raw) } : DEFAULT_ALARM_SETTINGS;
  } catch {
    return DEFAULT_ALARM_SETTINGS;
  }
}

export function writeAlarmSettings(settings: OrderAlarmSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("flamio-order-alarm-settings"));
  } catch {
    /* storage unavailable */
  }
}

let shared: AudioContext | null = null;

function context(): AudioContext | null {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!shared) shared = new Ctx();
  return shared;
}

/** Call from a tap/click so later sounds are allowed to play. */
export async function unlockAudio(): Promise<boolean> {
  try {
    const ctx = context();
    if (!ctx) return false;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

export function isAudioUnlocked(): boolean {
  return shared?.state === "running";
}

function tone(ctx: AudioContext, start: number, freq: number, peak: number, length: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.002), start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.01);
}

/** Kitchen's original short beep (own context, same sound as before). */
export function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => void ctx.close();
  } catch {
    /* autoplay restrictions — visual indicator still shows */
  }
}

/** One alarm burst: three quick two-tone pulses. */
export function playAlarmOnce(volume: number) {
  try {
    const ctx = context();
    if (!ctx || ctx.state !== "running") return;
    const peak = Math.min(Math.max(volume, 0), 1) * 0.5;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      tone(ctx, t + i * 0.3, 988, peak, 0.13);
      tone(ctx, t + i * 0.3 + 0.14, 784, peak, 0.13);
    }
  } catch {
    /* blocked — the banner still shows */
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startAlarm(volume: number, intervalSec: number) {
  stopAlarm();
  playAlarmOnce(volume);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") playAlarmOnce(volume);
  }, Math.max(intervalSec, 1) * 1000);
}

export function stopAlarm() {
  if (timer) clearInterval(timer);
  timer = null;
}
