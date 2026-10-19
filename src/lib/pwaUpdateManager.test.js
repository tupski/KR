import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPwaUpdateManagerForTests,
  applyUpdate,
  dismissUpdate,
  getState,
  initServiceWorkerUpdates,
  subscribe,
} from './pwaUpdateManager';

class FakeWorker extends EventTarget {
  constructor({ scriptURL = '/sw.js', state = 'installing' } = {}) {
    super();
    this.scriptURL = scriptURL;
    this.state = state;
    this.postMessage = vi.fn();
  }

  setState(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  constructor() {
    super();
    this.installing = null;
    this.waiting = null;
    this.active = null;
  }

  dispatchUpdateFound() {
    this.dispatchEvent(new Event('updatefound'));
  }
}

class FakeContainer extends EventTarget {
  constructor({ controller = { scriptURL: '/sw.js' }, registration = new FakeRegistration() } = {}) {
    super();
    this.controller = controller;
    this.registration = registration;
    this.register = vi.fn().mockResolvedValue(registration);
  }

  controllerChanged() {
    this.dispatchEvent(new Event('controllerchange'));
  }
}

const createWin = () => ({ location: { reload: vi.fn() } });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function trackStates() {
  const seen = [];
  const unsubscribe = subscribe((snapshot) => seen.push(snapshot.state));
  return { seen, unsubscribe };
}

describe('pwaUpdateManager', () => {
  beforeEach(() => {
    __resetPwaUpdateManagerForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    __resetPwaUpdateManagerForTests();
    vi.useRealTimers();
  });

  it('does not notify when there is no update', async () => {
    const container = new FakeContainer();
    const { seen } = trackStates();

    await initServiceWorkerUpdates({ container, win: createWin() });

    expect(seen).toEqual(['idle']);
    expect(getState().state).toBe('idle');
  });

  it('notifies available exactly once for updatefound -> installed with existing controller', async () => {
    const container = new FakeContainer();
    const reg = container.registration;
    await initServiceWorkerUpdates({ container, win: createWin() });

    const { seen } = trackStates();
    const worker = new FakeWorker();
    reg.installing = worker;
    reg.dispatchUpdateFound();

    // The browser may fire several 'installed' statechange events.
    worker.setState('installed');
    worker.setState('installed');
    worker.setState('installed');
    reg.waiting = worker;

    expect(seen.filter((s) => s === 'available')).toHaveLength(1);
    expect(getState().state).toBe('available');
    expect(getState().registration).toBe(reg);
  });

  it('does not prompt on first install (no controller)', async () => {
    const container = new FakeContainer({ controller: null });
    const reg = container.registration;
    await initServiceWorkerUpdates({ container, win: createWin() });

    const worker = new FakeWorker();
    reg.installing = worker;
    reg.dispatchUpdateFound();
    worker.setState('installed');
    reg.waiting = worker;

    expect(getState().state).toBe('idle');
  });

  it('notifies available when a waiting worker already exists before init', async () => {
    const container = new FakeContainer();
    container.registration.waiting = new FakeWorker({ state: 'installed' });

    await initServiceWorkerUpdates({ container, win: createWin() });

    expect(getState().state).toBe('available');
  });

  it('dismissUpdate sets dismissed without postMessage or reload', async () => {
    const win = createWin();
    const container = new FakeContainer();
    const waiting = new FakeWorker({ state: 'installed' });
    container.registration.waiting = waiting;
    await initServiceWorkerUpdates({ container, win });

    dismissUpdate();

    expect(getState().state).toBe('dismissed');
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('after dismiss does not re-prompt the same waiting worker but prompts a new one', async () => {
    const container = new FakeContainer();
    const reg = container.registration;
    const first = new FakeWorker({ state: 'installed' });
    reg.waiting = first;
    await initServiceWorkerUpdates({ container, win: createWin() });

    dismissUpdate();
    const { seen } = trackStates();
    expect(getState().state).toBe('dismissed');

    // Same waiting worker reported again.
    notifyAgain(reg, first);
    expect(seen.filter((s) => s === 'available')).toHaveLength(0);

    // A genuinely new waiting worker.
    const second = new FakeWorker({ state: 'installed' });
    reg.waiting = second;
    notifyAgain(reg, second);
    expect(seen.filter((s) => s === 'available')).toHaveLength(1);
  });

  it('applyUpdate posts SKIP_WAITING to the waiting worker and reloads once on controllerchange', async () => {
    const win = createWin();
    const container = new FakeContainer();
    const waiting = new FakeWorker({ state: 'installed' });
    container.registration.waiting = waiting;
    await initServiceWorkerUpdates({ container, win });

    const result = applyUpdate();
    expect(getState().state).toBe('activating');
    expect(waiting.postMessage).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    container.controllerChanged();
    container.controllerChanged();

    await expect(result).resolves.toBe(true);
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(getState().state).toBe('idle');
  });

  it('applyUpdate called twice concurrently posts and reloads once', async () => {
    const win = createWin();
    const container = new FakeContainer();
    const waiting = new FakeWorker({ state: 'installed' });
    container.registration.waiting = waiting;
    await initServiceWorkerUpdates({ container, win });

    const first = applyUpdate();
    const second = applyUpdate();
    expect(second).toBe(first);

    container.controllerChanged();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledTimes(1);
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('applyUpdate resolves false with no waiting worker', async () => {
    const win = createWin();
    const container = new FakeContainer();
    await initServiceWorkerUpdates({ container, win });

    await expect(applyUpdate()).resolves.toBe(false);
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('applyUpdate times out without reloading', async () => {
    vi.useFakeTimers();
    const win = createWin();
    const container = new FakeContainer();
    const waiting = new FakeWorker({ state: 'installed' });
    container.registration.waiting = waiting;
    await initServiceWorkerUpdates({ container, win });

    const result = applyUpdate();
    await vi.advanceTimersByTimeAsync(10001);

    await expect(result).resolves.toBe(false);
    expect(win.location.reload).not.toHaveBeenCalled();
    expect(getState().state).toBe('available');
    expect(getState().error).toBe(true);
  });

  it('registers the service worker only once', async () => {
    const container = new FakeContainer();
    await initServiceWorkerUpdates({ container, win: createWin() });
    await initServiceWorkerUpdates({ container, win: createWin() });

    expect(container.register).toHaveBeenCalledTimes(1);
    expect(container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
  });

  it('never mutates localStorage or sessionStorage during an apply flow', async () => {
    localStorage.setItem('kr:form-dirty:user-1', '1');
    sessionStorage.setItem('session-marker', 'keep');

    const win = createWin();
    const container = new FakeContainer();
    container.registration.waiting = new FakeWorker({ state: 'installed' });
    await initServiceWorkerUpdates({ container, win });

    const result = applyUpdate();
    container.controllerChanged();
    await expect(result).resolves.toBe(true);
    await flush();

    expect(localStorage.getItem('kr:form-dirty:user-1')).toBe('1');
    expect(sessionStorage.getItem('session-marker')).toBe('keep');
  });
});

/**
 * Simulate the wait for the browser to fire another `updatefound` cycle that
 * ends with `sw` being the waiting worker again.
 */
function notifyAgain(reg, sw) {
  reg.installing = null;
  reg.waiting = sw;
  const installer = new FakeWorker({ state: 'installed' });
  reg.installing = installer;
  reg.dispatchUpdateFound();
  installer.setState('installed');
  reg.installing = null;
}
