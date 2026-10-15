/**
 * Version checks are intentionally passive. A new version is recorded as
 * pending so the current page and any unfinished form remain untouched.
 */

const VERSION_STORAGE_KEY = 'app_version';
const PENDING_UPDATE_STORAGE_KEY = 'kr:app-update-pending';
export const FORM_DIRTY_STORAGE_PREFIX = 'kr:form-dirty:';
const LEGACY_FORM_DIRTY_KEY = 'kr:form-dirty';

const state = {
  inFlight: null,
  reloadTimer: null,
  lifecycleGeneration: 0,
};

const getStorage = (name) => {
  try {
    return typeof window !== 'undefined' ? window[name] : null;
  } catch {
    return null;
  }
};

const readStoredVersion = () => getStorage('localStorage')?.getItem(VERSION_STORAGE_KEY) || null;

const storeVersion = (version) => {
  getStorage('localStorage')?.setItem(VERSION_STORAGE_KEY, version);
};

const storePendingVersion = (version) => {
  getStorage('localStorage')?.setItem(PENDING_UPDATE_STORAGE_KEY, version);
};

const isFormDirty = () => {
  const storage = getStorage('localStorage');
  if (!storage) return false;
  if (storage.getItem(LEGACY_FORM_DIRTY_KEY) === '1') return true;

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(FORM_DIRTY_STORAGE_PREFIX) && storage.getItem(key) === '1') return true;
  }

  return false;
};

/**
 * Cancel the only reload this module can schedule. This is safe to call when
 * no update is pending or while the application is being unmounted.
 */
export const cancelScheduledAppReload = () => {
  state.lifecycleGeneration += 1;
  if (state.reloadTimer !== null) {
    clearTimeout(state.reloadTimer);
    state.reloadTimer = null;
  }
};

export const scheduleAppReload = (delay = 0, reloadImpl, versionToActivate = null) => {
  cancelScheduledAppReload();
  const generation = state.lifecycleGeneration;

  state.reloadTimer = setTimeout(() => {
    state.reloadTimer = null;
    if (generation !== state.lifecycleGeneration || isFormDirty()) return;

    if (versionToActivate) {
      storeVersion(versionToActivate);
      getStorage('localStorage')?.removeItem(PENDING_UPDATE_STORAGE_KEY);
    }

    const reload = reloadImpl || (() => window.location.reload());
    if (typeof window !== 'undefined' && typeof reload === 'function') reload();
  }, delay);

  return () => {
    if (generation === state.lifecycleGeneration) cancelScheduledAppReload();
  };
};

export const getAppUpdateState = () => ({
  currentVersion: readStoredVersion(),
  pendingVersion: getStorage('localStorage')?.getItem(PENDING_UPDATE_STORAGE_KEY) || null,
  reloadScheduled: state.reloadTimer !== null,
});

const fetchVersion = async (fetchImpl = globalThis.fetch) => {
  if (typeof fetchImpl !== 'function') return null;
  const response = await fetchImpl(`/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  if (!response.ok) return null;
  const data = await response.json();
  return typeof data?.version === 'string' && data.version.trim() ? data.version.trim() : null;
};

/**
 * Detect a version change without making focus or visibility a reload trigger.
 * The first successful check establishes a baseline and never reloads.
 */
export const checkAppUpdate = async ({ fetchImpl, scheduleReload = false, reloadImpl } = {}) => {
  if (state.inFlight) return state.inFlight;
  const requestGeneration = state.lifecycleGeneration;

  state.inFlight = (async () => {
    try {
      const serverVersion = await fetchVersion(fetchImpl);
      if (!serverVersion) return { status: 'unavailable' };

      const currentVersion = readStoredVersion();
      if (!currentVersion) {
        storeVersion(serverVersion);
        return { status: 'initialized', version: serverVersion };
      }

      if (currentVersion === serverVersion) {
        getStorage('localStorage')?.removeItem(PENDING_UPDATE_STORAGE_KEY);
        return { status: 'current', version: serverVersion };
      }

      storePendingVersion(serverVersion);
      if (isFormDirty()) {
        return { status: 'pending-form', version: serverVersion };
      }

      // Version activation is opt-in; the normal startup/visibility path only records it.
      if (scheduleReload && requestGeneration === state.lifecycleGeneration) {
        scheduleAppReload(0, reloadImpl, serverVersion);
        return { status: 'reload-scheduled', version: serverVersion };
      }

      return { status: 'pending', version: serverVersion };
    } catch (error) {
      return { status: 'unavailable', error };
    } finally {
      state.inFlight = null;
    }
  })();

  return state.inFlight;
};

export const resetAppUpdateStateForTests = () => {
  cancelScheduledAppReload();
  state.inFlight = null;
};

export const APP_UPDATE_STORAGE_KEYS = {
  VERSION: VERSION_STORAGE_KEY,
  PENDING: PENDING_UPDATE_STORAGE_KEY,
};
