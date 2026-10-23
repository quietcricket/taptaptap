import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionTimer,
  SESSION_KEY,
  BREAK_DURATION,
  formatTimer,
} from '../src/engine/session-timer.ts';
import { normalizeSettings } from '../src/engine/settings.ts';

function fixture() {
  let clock = 1_000_000;
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  return {
    saved,
    answer: () => {
      const { challenge } = JSON.parse(saved.get(SESSION_KEY));
      return String(challenge.left * challenge.right + challenge.adjustment);
    },
    storage,
    timer: new SessionTimer(storage, () => clock),
    reload: () => new SessionTimer(storage, () => clock),
    advance: (milliseconds) => {
      clock += milliseconds;
    },
  };
}

describe('persistent play sessions', () => {
  it('lets a correct parent answer skip the remaining five-minute break', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(10 * 60_000);
    assert.ok(f.timer.question());
    assert.equal(f.timer.unlock(f.answer()), 'unlocked');
    assert.equal(f.reload().status().phase, 'ready');
  });
  it('does not offer a skip question while the play session is still running', () => {
    const f = fixture();
    f.timer.begin(10);
    assert.equal(f.timer.question(), null);
    assert.equal(f.timer.unlock(f.answer()), 'waiting');
    assert.equal(f.timer.status().phase, 'playing');
  });
  it('keeps the same question across reloads, wrong answers, and disabled timer attempts', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(11 * 60_000);
    const question = f.timer.question();
    const refreshed = f.reload();
    assert.equal(refreshed.question(), question);
    for (const wrong of ['', 'hello', '1', '1.5', '-1']) {
      assert.equal(refreshed.unlock(wrong), 'incorrect');
      assert.equal(refreshed.question(), question);
    }
    refreshed.configure(0);
    refreshed.begin(30);
    assert.deepEqual(refreshed.status(), {
      phase: 'break',
      remaining: 4 * 60_000,
    });
    assert.equal(f.reload().question(), question);
  });
  it('cannot unlock if the successful answer cannot be persisted', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(11 * 60_000);
    f.storage.removeItem = () => {
      throw new Error('Storage blocked');
    };
    assert.equal(f.timer.unlock(f.answer()), 'unavailable');
    assert.equal(f.reload().status().phase, 'break');
  });
  it('upgrades older active breaks with one persisted question', () => {
    const f = fixture();
    const startedAt = 1_000_000;
    const playUntil = startedAt + 10 * 60_000;
    f.saved.set(
      SESSION_KEY,
      JSON.stringify({
        startedAt,
        playUntil,
        breakUntil: playUntil + BREAK_DURATION,
      }),
    );
    f.advance(11 * 60_000);
    assert.equal(f.timer.status().phase, 'break');
    const question = f.timer.question();
    assert.ok(question);
    assert.equal(f.reload().question(), question);
    assert.equal(f.reload().unlock(f.answer()), 'unlocked');
  });
  it('creates a fresh random challenge for the next session', () => {
    const f = fixture();
    const first = new SessionTimer(
      f.storage,
      () => 1_000_000,
      () => 0,
    );
    first.begin(10);
    const oldChallenge = JSON.parse(f.saved.get(SESSION_KEY)).challenge;
    f.advance(11 * 60_000);
    f.timer.unlock(f.answer());
    const next = new SessionTimer(
      f.storage,
      () => 2_000_000,
      () => 0.9,
    );
    next.begin(10);
    assert.notDeepEqual(
      JSON.parse(f.saved.get(SESSION_KEY)).challenge,
      oldChallenge,
    );
  });

  it('does not start a timer until play begins and leaves unlimited play alone', () => {
    const f = fixture();
    assert.equal(f.timer.status().phase, 'ready');
    assert.equal(f.timer.configure(10), true);
    assert.equal(f.saved.has(SESSION_KEY), false);
    f.timer.begin(0);
    assert.equal(f.saved.has(SESSION_KEY), false);
  });
  it('automatically unlocks after five minutes without any answer', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(10 * 60_000 - 1);
    assert.equal(f.timer.status().phase, 'playing');
    f.advance(1);
    assert.deepEqual(f.timer.status(), {
      phase: 'break',
      remaining: BREAK_DURATION,
    });
    f.advance(BREAK_DURATION - 1);
    assert.equal(f.timer.status().phase, 'break');
    f.advance(1);
    assert.deepEqual(f.timer.status(), { phase: 'ready', remaining: 0 });
    assert.equal(f.timer.question(), null);
  });
  it('keeps the original play deadline through refreshes and repeated keypresses', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(4 * 60_000);
    const reloaded = f.reload();
    reloaded.begin(10);
    f.timer.begin(10);
    assert.deepEqual(reloaded.status(), {
      phase: 'playing',
      remaining: 6 * 60_000,
    });
  });
  it('keeps the break locked on refresh, even when a stale tab has the timer turned off', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(11 * 60_000);
    const refreshed = f.reload();
    refreshed.begin(0);
    refreshed.configure(0);
    assert.deepEqual(refreshed.status(), {
      phase: 'break',
      remaining: 4 * 60_000,
    });
    assert.equal(f.timer.status().phase, 'break');
  });
  it('does not restart the five-minute break when a closed page is reopened', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(14 * 60_000);
    assert.deepEqual(f.reload().status(), {
      phase: 'break',
      remaining: 60_000,
    });
    f.advance(2 * 60_000);
    assert.deepEqual(f.reload().status(), { phase: 'ready', remaining: 0 });
  });
  it('shares the same deadline across tabs and does not start the next session automatically', () => {
    const f = fixture();
    const secondTab = f.reload();
    f.timer.begin(10);
    assert.equal(secondTab.status().phase, 'playing');
    f.advance(15 * 60_000);
    assert.equal(secondTab.status().phase, 'ready');
    f.advance(60_000);
    assert.equal(f.timer.status().phase, 'ready');
    secondTab.begin(10);
    assert.deepEqual(f.timer.status(), {
      phase: 'playing',
      remaining: 10 * 60_000,
    });
  });
  it('applies a changed limit from the original start rather than granting extra time', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(3 * 60_000);
    f.timer.configure(5);
    assert.deepEqual(f.timer.status(), {
      phase: 'playing',
      remaining: 2 * 60_000,
    });
  });
  it('starts a full break immediately if the shortened allowance is already used', () => {
    const f = fixture();
    f.timer.begin(20);
    f.advance(12 * 60_000);
    f.timer.configure(5);
    assert.deepEqual(f.timer.status(), {
      phase: 'break',
      remaining: BREAK_DURATION,
    });
  });
  it('lets a parent disable the timer before a break begins', () => {
    const f = fixture();
    f.timer.begin(10);
    f.timer.configure(0);
    f.advance(12 * 60_000);
    assert.equal(f.timer.status().phase, 'ready');
    assert.equal(f.saved.has(SESSION_KEY), false);
  });
  it('reports storage failure rather than silently starting an unpersisted timer', () => {
    const timer = new SessionTimer({
      getItem() {
        throw new Error('Storage blocked');
      },
      setItem() {
        throw new Error('Storage blocked');
      },
      removeItem() {
        throw new Error('Storage blocked');
      },
    });
    assert.equal(timer.begin(10), false);
    assert.equal(timer.configure(0), true);
    assert.equal(timer.begin(0), true);
  });
  it('continues enforcing a known break if storage temporarily becomes unreadable', () => {
    const f = fixture();
    f.timer.begin(10);
    f.advance(10 * 60_000);
    f.storage.getItem = () => {
      throw new Error('Temporary storage failure');
    };
    assert.equal(f.timer.status().phase, 'break');
  });
  it('recovers safely from malformed saved data and rejects invalid limit preferences', () => {
    const f = fixture();
    f.saved.set(SESSION_KEY, '{broken');
    assert.equal(f.timer.status().phase, 'ready');
    assert.equal(
      normalizeSettings({ playLimitMinutes: -1 }, ['float']).playLimitMinutes,
      0,
    );
    assert.equal(
      normalizeSettings({ playLimitMinutes: 10 }, ['float']).playLimitMinutes,
      10,
    );
  });
  it('rounds the countdown up and never displays negative time', () => {
    assert.equal(formatTimer(BREAK_DURATION), '05:00');
    assert.equal(formatTimer(1), '00:01');
    assert.equal(formatTimer(-1), '00:00');
  });
});
