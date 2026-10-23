export const SESSION_KEY = 'taptaptap.session.v1';
export const BREAK_DURATION = 5 * 60_000;

interface TimerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface Session {
  startedAt: number;
  playUntil: number;
  breakUntil: number;
}
export interface SessionStatus {
  phase: 'ready' | 'playing' | 'break';
  remaining: number;
}

/** Persist deadlines, not a countdown: reloads and background tabs cannot restart it. */
export class SessionTimer {
  private storage: TimerStorage;
  private now: () => number;
  private fallback: Session | null = null;

  constructor(storage: TimerStorage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  private read(): Session | null {
    try {
      const raw = JSON.parse(this.storage.getItem(SESSION_KEY) ?? 'null');
      if (
        raw &&
        [raw.startedAt, raw.playUntil, raw.breakUntil].every(
          Number.isSafeInteger,
        ) &&
        raw.startedAt >= 0 &&
        raw.playUntil >= raw.startedAt &&
        raw.breakUntil === raw.playUntil + BREAK_DURATION
      ) {
        this.fallback = raw;
        return raw;
      }
      this.fallback = null;
      return null;
    } catch {
      return this.fallback;
    }
  }

  private save(session: Session | null): boolean {
    try {
      if (session) this.storage.setItem(SESSION_KEY, JSON.stringify(session));
      else this.storage.removeItem(SESSION_KEY);
      this.fallback = session;
      return true;
    } catch {
      return false;
    }
  }

  status(): SessionStatus {
    const session = this.read();
    const now = this.now();
    if (!session || now >= session.breakUntil)
      return { phase: 'ready', remaining: 0 };
    if (now >= session.playUntil)
      return { phase: 'break', remaining: session.breakUntil - now };
    return { phase: 'playing', remaining: session.playUntil - now };
  }

  /** Repeated keypresses and reloads preserve an existing session or break. */
  begin(minutes: number): boolean {
    if (this.status().phase !== 'ready' || minutes === 0) return true;
    const startedAt = this.now();
    const playUntil = startedAt + minutes * 60_000;
    return this.save({
      startedAt,
      playUntil,
      breakUntil: playUntil + BREAK_DURATION,
    });
  }

  /** Parent changes apply to the current session, but never cancel an active break. */
  configure(minutes: number): boolean {
    if (this.status().phase === 'break') return true;
    if (minutes === 0) return this.read() ? this.save(null) : true;
    const session = this.read();
    if (!session || this.status().phase === 'ready') return true;
    const playUntil = Math.max(
      this.now(),
      session.startedAt + minutes * 60_000,
    );
    return this.save({
      ...session,
      playUntil,
      breakUntil: playUntil + BREAK_DURATION,
    });
  }
}

export function formatTimer(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
