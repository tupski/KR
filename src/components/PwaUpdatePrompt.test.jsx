import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const applyUpdateMock = vi.fn();
const dismissUpdateMock = vi.fn();
const getStateMock = vi.fn();
const subscribeMock = vi.fn();

vi.mock('@/lib/pwaUpdateManager', () => ({
  applyUpdate: (...args) => applyUpdateMock(...args),
  dismissUpdate: (...args) => dismissUpdateMock(...args),
  getState: () => getStateMock(),
  subscribe: (listener) => subscribeMock(listener),
}));

async function loadComponent() {
  const mod = await import('./PwaUpdatePrompt');
  return mod.default;
}

const available = { state: 'available', registration: {} };

function renderPrompt(Component) {
  return render(<Component />);
}

describe('PwaUpdatePrompt', () => {
  let PwaUpdatePrompt;

  beforeEach(async () => {
    applyUpdateMock.mockReset().mockResolvedValue(true);
    dismissUpdateMock.mockReset();
    subscribeMock.mockReset().mockImplementation(() => () => {});
    getStateMock.mockReset();
    PwaUpdatePrompt = await loadComponent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there is no update', () => {
    getStateMock.mockReturnValue({ state: 'idle', registration: null });

    renderPrompt(PwaUpdatePrompt);

    expect(screen.queryByText('Update baru tersedia')).toBeNull();
  });

  it('renders title, description and both buttons when an update is available', () => {
    getStateMock.mockReturnValue(available);

    renderPrompt(PwaUpdatePrompt);

    expect(screen.getByText('Update baru tersedia')).toBeTruthy();
    expect(
      screen.getByText(
        'Versi terbaru Kakarama Room tersedia. Muat ulang aplikasi untuk menggunakan versi terbaru.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Muat Ulang' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nanti' })).toBeTruthy();
  });

  it('calls dismissUpdate when Nanti is pressed', async () => {
    getStateMock.mockReturnValue(available);

    renderPrompt(PwaUpdatePrompt);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nanti' }));
    });

    expect(dismissUpdateMock).toHaveBeenCalledTimes(1);
    expect(applyUpdateMock).not.toHaveBeenCalled();
  });

  it('calls applyUpdate only once on a double click and shows the busy state', async () => {
    getStateMock.mockReturnValue(available);
    let resolveApply;
    applyUpdateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );

    renderPrompt(PwaUpdatePrompt);

    const reloadButton = screen.getByRole('button', { name: 'Muat Ulang' });
    await act(async () => {
      fireEvent.click(reloadButton);
      fireEvent.click(reloadButton);
    });

    expect(applyUpdateMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Memuat ulang/ }).disabled).toBe(true);

    await act(async () => {
      resolveApply(false);
    });

    await waitFor(() => {
      expect(screen.getByText('Gagal memperbarui aplikasi. Coba lagi.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Muat Ulang' }).disabled).toBe(false);
    });
  });
});
