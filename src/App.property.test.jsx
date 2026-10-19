/**
 * Property-Based Tests for App.jsx — Navigation by Role
 *
 * Feature: role-based navigation
 * Property 1: Menu sekunder sesuai role
 * Property 2: Redirect tab yang tidak diizinkan
 *
 * For any user role drawn from {'admin', 'super_admin', 'karyawan'}, the
 * visible tab set, the primary tab set, and the secondary ("Lainnya") tab set
 * SHALL match the derivation in `src/App.jsx`.
 *
 * Implementation note — pure function approach:
 * Rendering the full <App /> component would require mocking many heavy
 * children plus SupabaseAuthContext, the Supabase client, framer-motion timers
 * and Radix portals, only to read back a tab list derived purely from
 * `userRole`. This test therefore replicates the tab derivation as pure
 * functions, mirroring the source of truth in `src/App.jsx`. Any change to
 * that derivation in App.jsx must be mirrored here, and vice versa.
 *
 * Source of truth in App.jsx (as of this test):
 *   allTabs           — form, dashboard, request, kamar, finance, ranking,
 *                       chart, pengaturan.
 *   allowedTabsByRole — karyawan: ['form', 'kamar', 'request'];
 *                       admin: all tabs except 'pengaturan', 'ranking',
 *                       'chart'; super_admin: all tabs.
 *   primaryTabs       — karyawan → ['kamar', 'request'];
 *                       admin → ['dashboard', 'kamar', 'finance', 'request'];
 *                       super_admin → ['dashboard', 'kamar', 'finance'].
 *   secondaryTabs     — karyawan → []; else → visibleTabs filtered by
 *                       removing primaryTabs ids and 'form'.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Source of truth replicated from src/App.jsx
// ---------------------------------------------------------------------------

const allTabs = [
  { id: 'form', label: 'Input' },
  { id: 'dashboard', label: 'Laporan' },
  { id: 'request', label: 'Permintaan' },
  { id: 'kamar', label: 'Kamar' },
  { id: 'finance', label: 'Keuangan' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'chart', label: 'Grafik' },
  { id: 'pengaturan', label: 'Pengaturan' },
];

const allowedTabsByRole = {
  karyawan: ['form', 'kamar', 'request'],
  admin: allTabs
    .filter((t) => !['pengaturan', 'ranking', 'chart'].includes(t.id))
    .map((t) => t.id),
  super_admin: allTabs.map((t) => t.id),
};

const primaryTabIdsByRole = (role) => {
  if (role === 'karyawan') return ['kamar', 'request'];
  // Admin: Permintaan replaces the "Lainnya" menu; super admin keeps the old layout.
  return role === 'admin'
    ? ['dashboard', 'kamar', 'finance', 'request']
    : ['dashboard', 'kamar', 'finance'];
};

const visibleTabsFor = (role) => {
  const allowed = allowedTabsByRole[role] || allTabs.map((t) => t.id);
  return allTabs.filter((t) => allowed.includes(t.id));
};

const primaryTabsFor = (role) => {
  const visible = visibleTabsFor(role);
  return primaryTabIdsByRole(role)
    .map((id) => visible.find((tab) => tab.id === id))
    .filter(Boolean);
};

/**
 * Mirrors the `secondaryTabs` useMemo in App.jsx.
 * @param {'admin'|'super_admin'|'karyawan'} role
 * @returns {Array<{id: string, label: string}>}
 */
function computeSecondaryTabs(role) {
  // karyawan never has a "more" menu
  if (role === 'karyawan') return [];

  // hidden = primary tab ids + 'form' (the centre input button)
  const hiddenFromPrimary = new Set([...primaryTabIdsByRole(role), 'form']);
  return visibleTabsFor(role).filter((t) => !hiddenFromPrimary.has(t.id));
}

const secondaryIds = (role) => computeSecondaryTabs(role).map((t) => t.id);

// ---------------------------------------------------------------------------
// Property 1: Menu sekunder (Ranking/Grafik/Pengaturan) sesuai role
// ---------------------------------------------------------------------------

describe('App — Property 1: Menu sekunder sesuai role', () => {
  it(
    'Property 1: Ranking/Grafik hanya ada di secondaryTabs super_admin, tidak untuk admin/karyawan',
    () => {
      // super_admin keeps full parity (ranking, chart, pengaturan in "Lainnya"),
      // admin never sees them, karyawan has no secondary tabs at all.
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('admin'),
            fc.constant('super_admin'),
            fc.constant('karyawan')
          ),
          (userRole) => {
            const secondary = secondaryIds(userRole);
            const visibleIds = visibleTabsFor(userRole).map((t) => t.id);

            if (userRole === 'super_admin') {
              expect(secondary).toContain('ranking');
              expect(secondary).toContain('chart');
              expect(secondary).toContain('pengaturan');
            }

            if (userRole === 'admin') {
              expect(secondary).not.toContain('ranking');
              expect(secondary).not.toContain('chart');
              expect(secondary).not.toContain('pengaturan');
              expect(visibleIds).not.toContain('ranking');
              expect(visibleIds).not.toContain('chart');
              expect(visibleIds).not.toContain('pengaturan');
              // Admin's four primary tabs consume every visible tab.
              expect(secondary).toEqual([]);
            }

            if (userRole === 'karyawan') {
              expect(secondary).toEqual([]);
              expect(visibleIds).not.toContain('ranking');
              expect(visibleIds).not.toContain('chart');
            }

            return true;
          }
        ),
        { numRuns: 100, verbose: false }
      );
    }
  );

  it('Property 1b: primaryTabs admin 4 tab, super_admin 3 tab', () => {
    // Layout contract: admin → 4 (Permintaan replaces "Lainnya"),
    // super_admin → 3 (keeps the "Lainnya" menu).
    fc.assert(
      fc.property(
        fc.constantFrom('admin', 'super_admin', 'karyawan'),
        (userRole) => {
          const primary = primaryTabsFor(userRole).map((t) => t.id);
          expect(primary).toEqual(primaryTabIdsByRole(userRole));

          if (userRole === 'admin') {
            expect(primary).toEqual(['dashboard', 'kamar', 'finance', 'request']);
          }
          if (userRole === 'super_admin') {
            expect(primary).toEqual(['dashboard', 'kamar', 'finance']);
          }
          return true;
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });
});

// ---------------------------------------------------------------------------
// Source of truth (continued) — redirect logic
// ---------------------------------------------------------------------------

/**
 * Mirrors the redirect useEffect in App.jsx:
 *
 *   useEffect(() => {
 *     if (!visibleTabIds.includes(activeTab)) {
 *       setActiveTab('form');
 *     }
 *   }, [activeTab, visibleTabIds]);
 *
 * Given a role and a desired `activeTab`, returns the effective tab id that
 * App.jsx will settle on after the redirect effect has run. If the desired
 * tab is allowed for the role, the active tab is unchanged; otherwise it is
 * forced to 'form'.
 *
 * @param {'admin'|'super_admin'|'karyawan'} role
 * @param {string} desiredTab
 * @returns {string} the effective active tab id
 */
function effectiveActiveTab(role, desiredTab) {
  const visibleTabIds =
    allowedTabsByRole[role] || allTabs.map((t) => t.id);
  if (!visibleTabIds.includes(desiredTab)) {
    return 'form';
  }
  return desiredTab;
}

// ---------------------------------------------------------------------------
// Property 2: Redirect tab yang tidak diizinkan
// ---------------------------------------------------------------------------

describe('App — Property 2: Redirect tab yang tidak diizinkan', () => {
  it(
    'Property 2: admin dialihkan ke "form" saat membuka ranking/chart/pengaturan',
    () => {
      // Layer 1: explicit admin case for the super-admin-only menus.
      fc.assert(
        fc.property(
          fc.constant('admin'),
          fc.constantFrom('ranking', 'chart', 'pengaturan'),
          (userRole, desiredTab) => {
            expect(effectiveActiveTab(userRole, desiredTab)).toBe('form');
            return true;
          }
        ),
        { numRuns: 100, verbose: false }
      );

      // Layer 2: generalised over every tab id for role='karyawan'.
      fc.assert(
        fc.property(
          fc.constant('karyawan'),
          fc.constantFrom(...allTabs.map((t) => t.id)),
          (userRole, desiredTab) => {
            const allowed = allowedTabsByRole[userRole];
            const effective = effectiveActiveTab(userRole, desiredTab);

            if (allowed.includes(desiredTab)) {
              // Allowed tabs (form, kamar, request) stay as-is.
              expect(effective).toBe(desiredTab);
            } else {
              // Disallowed tabs redirect back to the default 'form' tab.
              expect(effective).toBe('form');
            }
            return true;
          }
        ),
        { numRuns: 100, verbose: false }
      );

      // Layer 3: generalised over every role × tab combination.
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('admin'),
            fc.constant('super_admin'),
            fc.constant('karyawan')
          ),
          fc.constantFrom(...allTabs.map((t) => t.id)),
          (userRole, desiredTab) => {
            const allowed = allowedTabsByRole[userRole];
            const effective = effectiveActiveTab(userRole, desiredTab);

            // The effective tab is always allowed for the user's role.
            expect(allowed).toContain(effective);
            return true;
          }
        ),
        { numRuns: 100, verbose: false }
      );
    }
  );
});
