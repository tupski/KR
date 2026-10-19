/**
 * PWA service worker update lifecycle manager.
 *
 * Single source of truth for:
 *  - registering /sw.js with a no-cache update check
 *  - detecting a *waiting* worker (i.e. an update, not a first install)
 *  - letting the UI dismiss or apply the update
 *
 * Deliberately dependency-free and injectable so it can be unit tested with
 * fake `navigator.serviceWorker` containers.
 *
 * This module never clears storage and never reloads on its own. A reload only
 * happens inside `applyUpdate()` after a real `controllerchange`.
 */

const SKIP_WAITING = { type: 'SKIP_WAITING' };
const CONTROLLER_CHANGE_TIMEOUT_MS = 10000;

let initialized = false;
let boundContainer = null;
let registration = null;
let winRef = typeof window !== 'undefined' ? window : { location: { reload() {} } };

const listeners = new Set();

let currentState = { state: 'idle', registration: null };

let lastNotified = { sw: null, id: 0 };
let notifyCounter = 0;

let activatingPromise = null;
let pendingResolve = null;
let pendingTimeout = null;
let reloaded = false;

function setState(next) {
  currentState = next;
  for (const listener of Array.from(listeners)) {
    try {
      listener(currentState);
    } catch (_error) {
      // A broken subscriber must never break the update lifecycle.
    }
  }
}

function clearActivation() {
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  pendingResolve = null;
  activatingPromise = null;
}

function finishActivation(result, { error = false } = {}) {
  const resolve = pendingResolve;
  if (!resolve) return;

  clearActivation();

  if (result) {
    setState({ state: 'idle', registration });
  } else {
    setState({ state: 'available', registration, error });
  }

  resolve(result);
}

function reloadOnce() {
  if (reloaded) return;
  reloaded = true;
  try {
    winRef?.location?.reload?.();
  } catch (_error) {
    // Ignore environments where reload is not implemented.
  }
}

function onControllerChange() {
  // Only a user-initiated `applyUpdate()` may trigger a reload.
  if (!activatingPromise) return;
  reloadOnce();
  finishActivation(true);
}

function notifyWaiting(reg) {
  const sw = reg?.waiting || reg?.installing || null;
  if (!sw) return;
  // Same waiting worker already surfaced (or already dismissed) — do not nag.
  if (lastNotified.sw === sw) return;
  // Never interrupt an in-flight activation.
  if (currentState.state === 'activating') return;

  lastNotified = { sw, id: ++notifyCounter };
  setState({ state: 'available', registration: reg });
}

function watchInstalling(reg) {
  const installing = reg?.installing;
  if (!installing || typeof installing.addEventListener !== 'function') return;

  installing.addEventListener('statechange', () => {
    if (installing.state !== 'installed') return;
    // No controller means this is the very first install, not an update.
    if (!boundContainer?.controller) return;
    notifyWaiting(reg);
  });
}

/**
 * Register the service worker (once) and wire update detection.
 *
 * @param {{ container?: object, win?: object }} [options]
 * @returns {Promise<void>}
 */
export function initServiceWorkerUpdates({ container = navigator.serviceWorker, win = window } = {}) {
  if (initialized) return Promise.resolve();
  initialized = true;

  boundContainer = container;
  winRef = win || winRef;

  if (!container || typeof container.register !== 'function') {
    return Promise.resolve();
  }

  return Promise.resolve(container.register('/sw.js', { updateViaCache: 'none' }))
    .then((reg) => {
      registration = reg;
      if (!reg) return;

      if (typeof container.addEventListener === 'function') {
        container.addEventListener('controllerchange', onControllerChange);
      }

      // Update was already waiting before this module initialized.
      if (reg.waiting) {
        notifyWaiting(reg);
      }

      if (typeof reg.addEventListener === 'function') {
        reg.addEventListener('updatefound', () => watchInstalling(reg));
        // `installing` may already exist when init runs mid-update.
        watchInstalling(reg);
      }
    })
    .catch((error) => {
      // Allow a later retry after a failed registration.
      initialized = false;
      throw error;
    });
}

/**
 * Subscribe to lifecycle state changes. Fires synchronously with the current
 * state so React can hydrate its snapshot without a race.
 *
 * @param {(state: { state: string, registration: object|null, error?: boolean }) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
}

export function getState() {
  return currentState;
}

/**
 * Hide the prompt for the currently waiting worker. Never sends SKIP_WAITING,
 * never reloads. A genuinely new waiting worker will prompt again.
 */
export function dismissUpdate() {
  if (currentState.state !== 'available') return;
  setState({ state: 'dismissed', registration });
}

/**
 * Activate the waiting worker and reload once the new controller takes over.
 *
 * @returns {Promise<boolean>} true when the reload was triggered.
 */
export function applyUpdate() {
  if (activatingPromise) return activatingPromise;

  const waiting = registration?.waiting;
  if (!waiting) return Promise.resolve(false);

  setState({ state: 'activating', registration });

  activatingPromise = new Promise((resolve) => {
    pendingResolve = resolve;

    pendingTimeout = setTimeout(() => {
      finishActivation(false, { error: true });
    }, CONTROLLER_CHANGE_TIMEOUT_MS);

    try {
      waiting.postMessage(SKIP_WAITING);
    } catch (_error) {
      finishActivation(false, { error: true });
    }
  });

  return activatingPromise;
}

/** Test-only: reset every module-level field. */
export function __resetPwaUpdateManagerForTests() {
  initialized = false;
  boundContainer = null;
  registration = null;
  winRef = typeof window !== 'undefined' ? window : { location: { reload() {} } };
  listeners.clear();
  currentState = { state: 'idle', registration: null };
  lastNotified = { sw: null, id: 0 };
  notifyCounter = 0;
  reloaded = false;
  clearActivation();
}
