import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_UPDATE_STORAGE_KEYS,
  cancelScheduledAppReload,
  checkAppUpdate,
  getAppUpdateState,
  resetAppUpdateStateForTests,
  scheduleAppReload,
} from './checkAppUpdate';

const responseFor = (version) => ({
  ok: true,
  json: async () => ({ version }),
});

describe('checkAppUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetAppUpdateStateForTests();
    vi.useRealTimers();
  });

  afterEach(() => {
    cancelScheduledAppReload();
    vi.useRealTimers();
  });

  it('does not reload when the stored version matches the server', async () => {
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.VERSION, '2.2.1');
    const result = await checkAppUpdate({
      fetchImpl: vi.fn().mockResolvedValue(responseFor('2.2.1')),
      scheduleReload: true,
    });

    expect(result.status).toBe('current');
    expect(getAppUpdateState().reloadScheduled).toBe(false);
  });

  it('establishes a first-visit baseline without cleanup or reload', async () => {
    const result = await checkAppUpdate({
      fetchImpl: vi.fn().mockResolvedValue(responseFor('2.2.1')),
      scheduleReload: true,
    });

    expect(result).toEqual({ status: 'initialized', version: '2.2.1' });
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.VERSION)).toBe('2.2.1');
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.PENDING)).toBeNull();
  });

  it('protects an active dirty form from a version activation', async () => {
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.VERSION, '2.2.0');
    localStorage.setItem('kr:form-dirty:user-1', '1');

    const result = await checkAppUpdate({
      fetchImpl: vi.fn().mockResolvedValue(responseFor('2.2.1')),
      scheduleReload: true,
    });

    expect(result).toEqual({ status: 'pending-form', version: '2.2.1' });
    expect(getAppUpdateState().reloadScheduled).toBe(false);
  });

  it('records a real version change without destructive cleanup', async () => {
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.VERSION, '2.2.0');

    const result = await checkAppUpdate({
      fetchImpl: vi.fn().mockResolvedValue(responseFor('2.2.1')),
    });

    expect(result).toEqual({ status: 'pending', version: '2.2.1' });
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.VERSION)).toBe('2.2.0');
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.PENDING)).toBe('2.2.1');
  });

  it('does not reload or alter session storage when the version endpoint fails', async () => {
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.VERSION, '2.2.0');
    sessionStorage.setItem('session-marker', 'keep');
    const result = await checkAppUpdate({
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
      scheduleReload: true,
    });

    expect(result.status).toBe('unavailable');
    expect(sessionStorage.getItem('session-marker')).toBe('keep');
    expect(getAppUpdateState().reloadScheduled).toBe(false);
  });

  it('shares one in-flight request between simultaneous checks', async () => {
    let resolveFetch;
    const fetchImpl = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const first = checkAppUpdate({ fetchImpl });
    const second = checkAppUpdate({ fetchImpl });
    resolveFetch(responseFor('2.2.1'));

    expect(await first).toEqual({ status: 'initialized', version: '2.2.1' });
    expect(await second).toEqual({ status: 'initialized', version: '2.2.1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cancels a scheduled reload and clears its timer state', () => {
    vi.useFakeTimers();
    const reload = vi.fn();

    scheduleAppReload(1000, reload);
    cancelScheduledAppReload();
    vi.advanceTimersByTime(1000);

    expect(reload).not.toHaveBeenCalled();
    expect(getAppUpdateState().reloadScheduled).toBe(false);
  });

  it('activates an explicitly scheduled clean update', () => {
    vi.useFakeTimers();
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.VERSION, '2.2.0');
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.PENDING, '2.2.1');
    const reload = vi.fn();

    scheduleAppReload(1000, reload, '2.2.1');
    vi.advanceTimersByTime(1000);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.VERSION)).toBe('2.2.1');
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.PENDING)).toBeNull();
  });

  it('does not schedule a reload when an old request finishes after cancellation', async () => {
    vi.useFakeTimers();
    let resolveFetch;
    const fetchImpl = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.VERSION, '2.2.0');

    const request = checkAppUpdate({ fetchImpl, scheduleReload: true });
    cancelScheduledAppReload();
    resolveFetch(responseFor('2.2.1'));

    await request;
    vi.runAllTimers();
    expect(getAppUpdateState().reloadScheduled).toBe(false);
  });

  it('does not duplicate reloads for repeated update checks', async () => {
    vi.useFakeTimers();
    localStorage.setItem(APP_UPDATE_STORAGE_KEYS.VERSION, '2.2.0');
    const fetchImpl = vi.fn().mockResolvedValue(responseFor('2.2.1'));
    const reload = vi.fn();

    await checkAppUpdate({ fetchImpl, scheduleReload: true, reloadImpl: reload });
    await checkAppUpdate({ fetchImpl, scheduleReload: true, reloadImpl: reload });

    expect(getAppUpdateState().reloadScheduled).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.VERSION)).toBe('2.2.1');
    expect(localStorage.getItem(APP_UPDATE_STORAGE_KEYS.PENDING)).toBeNull();
  });
});
