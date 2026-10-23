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
    storage,
    timer: new SessionTimer(storage, () => clock),
    reload: () => new SessionTimer(storage, () => clock),
    advance: (milliseconds) => {
      clock += milliseconds;
    },
  };
}

describe('persistent play sessions', () => {
  it('does not start a timer until play begins and leaves unlimited play alone', () => {
    const f = fixture();
    assert.equal(f.timer.status().phase, 'ready');
    assert.equal(f.timer.configure(10), true);
    assert.equal(f.saved.has(SESSION_KEY), false);
    f.timer.begin(0);
    assert.equal(f.saved.has(SESSION_KEY), false);
  });
  it('locks after ten minutes and stays locked for exactly five minutes', () => {
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
    assert.equal(f.timer.status().phase, 'ready');
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
    assert.equal(f.reload().status().phase, 'ready');
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
