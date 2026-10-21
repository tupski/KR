import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted state shared with module mocks.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const authValues = {
    session: null,
    loading: false,
    signOut: () => {},
    userRole: null,
    isSuperAdmin: false,
    user: null,
    isAdmin: false,
  };
  const mountLog = [];
  return { authValues, mountLog };
});

const setAuthValues = (partial) => {
  h.authValues = { ...h.authValues, ...partial };
};

// ---------------------------------------------------------------------------
// Mocks — App renders its authenticated layout cheaply.
// ---------------------------------------------------------------------------

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => h.authValues,
  AuthProvider: ({ children }) => children,
}));

vi.mock('@/lib/customSupabaseClient', () => {
  // Chainable thenable: await supabase.from(x).select() resolves { data: [] }
  const makeChainable = () => {
    const result = Promise.resolve({ data: [], error: null });
    const proxy = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return (resolve, reject) => result.then(resolve, reject);
        if (prop === 'catch') return (reject) => result.catch(reject);
        return () => proxy;
      },
    });
    return proxy;
  };

  const channel = () => {
    const proxy = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'subscribe') return () => proxy;
        return () => proxy;
      },
    });
    return proxy;
  };

  return {
    supabase: {
      from: () => makeChainable(),
      channel: () => channel(),
      removeChannel: () => {},
      auth: {
        getSession: async () => ({ data: { session: null } }),
      },
    },
  };
});

vi.mock('@/hooks/usePageVisibility', () => ({
  useDisableAutoReload: () => {},
}));

vi.mock('@/config/featureFlags', () => ({
  NOTIFICATIONS_ENABLED: false,
}));

// framer-motion stub — real lib is unnecessary for lifecycle assertions.
// Component identity must be stable across renders (cached per prop) or React
// remounts the subtree on every render.
vi.mock('framer-motion', () => {
  const cache = {};
  return {
    motion: new Proxy({}, {
      get: (_target, prop) => {
        if (!cache[prop]) {
          cache[prop] = (props) => React.createElement(prop, props);
        }
        return cache[prop];
      },
    }),
    AnimatePresence: ({ children }) => children,
  };
});

// Form probe — mounted on the default active tab ('form') for role 'karyawan'.
vi.mock('@/components/KaryawanTransaksi', () => {
  function FormProbe() {
    React.useEffect(() => {
      h.mountLog.push('mount-form');
      return () => {
        h.mountLog.push('unmount-form');
      };
    }, []);
    return React.createElement('input', { 'data-testid': 'form-input' });
  }
  return { default: FormProbe };
});

vi.mock('@/components/FormTransaksiModern', () => ({
  default: () => React.createElement('div', { 'data-testid': 'form-modern-stub' }),
}));
vi.mock('@/components/DashboardPemasukan', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/RankingMarketing', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/OmsetChart', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/KetersediaanKamar', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/HalamanTagihan', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/HalamanRequest', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/SuperAdminDashboard', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/AnalyticsDashboard', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/Auth', () => ({ default: () => React.createElement('div', { 'data-testid': 'auth-stub' }) }));
vi.mock('@/components/NotificationsInbox', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/AllNotifications', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/AnnouncementBanner', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/ComposeAnnouncement', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/AccountSettings', () => ({ default: () => React.createElement('div') }));
vi.mock('@/components/KalenderLibur', () => ({ default: () => React.createElement('div') }));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }) => React.createElement('div', null, children),
  AvatarImage: () => null,
  AvatarFallback: ({ children }) => React.createElement('span', null, children),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => React.createElement('button', props, children),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => React.createElement('div', null, children),
  DropdownMenuTrigger: ({ children }) => React.createElement('div', null, children),
  DropdownMenuContent: ({ children }) => React.createElement('div', null, children),
  DropdownMenuLabel: ({ children }) => React.createElement('div', null, children),
  DropdownMenuSeparator: () => null,
  DropdownMenuItem: ({ children, ...props }) =>
    React.createElement('button', props, children),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: () => null,
  AlertDialogAction: () => null,
  AlertDialogCancel: () => null,
  AlertDialogContent: () => null,
  AlertDialogDescription: () => null,
  AlertDialogFooter: () => null,
  AlertDialogHeader: () => null,
  AlertDialogTitle: () => null,
}));

// Real checkAppUpdate module (pure localStorage) — required for isFormDirty.
import { isFormDirty } from '@/utils/checkAppUpdate';

async function loadApp() {
  const mod = await import('./App');
  return mod.default;
}

const KARYAWAN_AUTH = {
  loading: false,
  session: { access_token: 'tok-a', user: { id: 'user-1' } },
  user: { id: 'user-1' },
  userRole: 'karyawan',
  isSuperAdmin: false,
  isAdmin: false,
};

describe('App form lifecycle', () => {
  let App;

  beforeEach(async () => {
    localStorage.clear();
    h.mountLog.length = 0;
    h.authValues = { ...KARYAWAN_AUTH, signOut: () => {} };
    App = await loadApp();
  });

  it('keeps the form mounted when the same user re-authenticates with a new token', async () => {
    const { rerender } = render(<App />);

    await waitFor(() => {
      expect(h.mountLog).toContain('mount-form');
    });

    const input = screen.getByTestId('form-input');
    fireEvent.change(input, { target: { value: 'unsaved-xyz' } });
    expect(input.value).toBe('unsaved-xyz');

    // Simulate TOKEN_REFRESHED / SIGNED_IN: same user, new access token.
    setAuthValues({
      session: { access_token: 'tok-b', user: { id: 'user-1' } },
      user: { id: 'user-1' },
    });
    rerender(<App />);

    expect(screen.getByTestId('form-input')).toBeTruthy();
    expect(screen.getByTestId('form-input').value).toBe('unsaved-xyz');
    expect(h.mountLog).not.toContain('unmount-form');
  });

  it('unmounts and remounts the form when loading flips (documents the gating)', async () => {
    const { rerender } = render(<App />);

    await waitFor(() => {
      expect(h.mountLog).toContain('mount-form');
    });

    setAuthValues({ loading: true });
    rerender(<App />);

    expect(h.mountLog).toContain('unmount-form');
    expect(screen.queryByTestId('form-input')).toBeNull();

    setAuthValues({ loading: false });
    rerender(<App />);

    await waitFor(() => {
      expect(h.mountLog.filter((entry) => entry === 'mount-form').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByTestId('form-input')).toBeTruthy();
  });

  it('updates visible tabs when the role changes', async () => {
    const { rerender } = render(<App />);

    await waitFor(() => {
      expect(h.mountLog).toContain('mount-form');
    });

    // Karyawan: Kamar & Permintaan tabs, no Keuangan.
    expect(screen.queryByText('Kamar')).toBeTruthy();
    expect(screen.queryByText('Permintaan')).toBeTruthy();
    expect(screen.queryByText('Keuangan')).toBeNull();

    setAuthValues({ userRole: 'admin' });
    rerender(<App />);

    expect(screen.getByText('Keuangan')).toBeTruthy();
  });

  it('isFormDirty reads the per-user dirty key from localStorage', () => {
    localStorage.setItem('kr:form-dirty:user-1', '1');
    expect(isFormDirty()).toBe(true);

    localStorage.removeItem('kr:form-dirty:user-1');
    expect(isFormDirty()).toBe(false);
  });
});
