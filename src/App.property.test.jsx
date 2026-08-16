/**
 * Property-Based Tests for App.jsx — Navigation by Role
 *
 * Feature: analytics-dashboard
 * Property 1: Akses menu Analitik berdasarkan role
 *
 * For any user role drawn from {'admin', 'super_admin', 'karyawan'}, the
 * "Analitik" tab SHALL appear in `secondaryTabs` for `admin` / `super_admin`
 * and SHALL NOT appear for `karyawan`.
 *
 * Validates: Requirements 1.1, 1.3
 *
 * --------------------------------------------------------------------------
 * Implementation note — pure function approach
 * --------------------------------------------------------------------------
 * Rendering the full <App /> component requires mocking many heavy children
 * (FormTransaksiModern, KaryawanTransaksi, DashboardPemasukan, OmsetChart,
 *  KetersediaanKamar, HalamanTagihan, HalamanRequest, SuperAdminDashboard,
 *  AnalyticsDashboard, NotificationsInbox, AccountSettings, KalenderLibur,
 *  AnnouncementBanner, ComposeAnnouncement, …) plus the AuthContext,
 *  the REST API client, framer-motion timers, and Radix portals — all so we
 * can read back a tab list that is derived purely from `userRole`.
 *
 * Per the task's recommended alternative, this test instead replicates the
 * `secondaryTabs` derivation as a pure function, mirroring the source of
 * truth in `src/App.jsx`. Any change to that derivation in App.jsx must be
 * mirrored here, and vice versa.
 *
 * Source of truth in App.jsx (as of this test):
 *   - `allTabs`           — see App.jsx around the `const allTabs = [...]`
 *                            declaration (includes `{ id: 'analytics',
 *                            label: 'Analitik', icon: BarChart2 }`).
 *   - `allowedTabsByRole` — `karyawan: ['form', 'kamar', 'request']`,
 *                            `admin`: all tabs except `'pengaturan'`,
 *                            `super_admin`: all tabs.
 *   - `primaryTabs`       — `karyawan → ['kamar', 'request']`,
 *                            else → `['dashboard', 'kamar', 'finance']`.
 *   - `secondaryTabs`     — `karyawan → []`,
 *                            else → visibleTabs filtered by removing
 *                            primaryTabs ids and `'form'`.
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
  { id: 'analytics', label: 'Analitik' },
  { id: 'pengaturan', label: 'Pengaturan' },
];

const allowedTabsByRole = {
  karyawan: ['form', 'kamar', 'request'],
  admin: allTabs.filter((t) => t.id !== 'pengaturan').map((t) => t.id),
  super_admin: allTabs.map((t) => t.id),
};

const primaryTabIdsByRole = (role) =>
  role === 'karyawan'
    ? ['kamar', 'request']
    : ['dashboard', 'kamar', 'finance'];

/**
 * Mirrors the `secondaryTabs` useMemo in App.jsx.
 * @param {'admin'|'super_admin'|'karyawan'} role
 * @returns {Array<{id: string, label: string}>}
 */
function computeSecondaryTabs(role) {
  // visibleTabs = allTabs filtered by allowedTabsByRole[role]
  const allowed = allowedTabsByRole[role] || allTabs.map((t) => t.id);
  const visibleTabs = allTabs.filter((t) => allowed.includes(t.id));

  // karyawan never has a "more" menu
  if (role === 'karyawan') return [];

  // hidden = primary tab ids + 'form' (the centre input button)
  const hiddenFromPrimary = new Set([...primaryTabIdsByRole(role), 'form']);
  return visibleTabs.filter((t) => !hiddenFromPrimary.has(t.id));
}

// ---------------------------------------------------------------------------
// Property 1: Akses menu Analitik berdasarkan role
// ---------------------------------------------------------------------------

describe('App — Property 1: Akses menu Analitik berdasarkan role', () => {
  /**
   * Property 1: Akses menu Analitik berdasarkan role
   *
   * Feature: analytics-dashboard, Property 1: Akses menu Analitik berdasarkan role
   *
   * For any `userRole` drawn from {'admin', 'super_admin', 'karyawan'}:
   *   - IF role ∈ {'admin', 'super_admin'} THEN computeSecondaryTabs(role)
   *     SHALL contain a tab with id === 'analytics' AND label === 'Analitik'.
   *   - IF role === 'karyawan' THEN computeSecondaryTabs(role) SHALL NOT
   *     contain any tab with id === 'analytics' (in fact, it returns [] for
   *     karyawan, so no secondary tab is exposed at all).
   *
   * Validates: Requirements 1.1, 1.3
   */
  it(
    'Property 1: item "Analitik" muncul di secondaryTabs untuk admin/super_admin, tidak muncul untuk karyawan',
    () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('admin'),
            fc.constant('super_admin'),
            fc.constant('karyawan')
          ),
          (userRole) => {
            const secondaryTabs = computeSecondaryTabs(userRole);
            const analyticsTab = secondaryTabs.find((t) => t.id === 'analytics');

            if (userRole === 'admin' || userRole === 'super_admin') {
              // Must contain the Analitik tab.
              expect(analyticsTab).toBeDefined();
              expect(analyticsTab.label).toBe('Analitik');
            } else {
              // role === 'karyawan': must NOT contain the Analitik tab.
              expect(analyticsTab).toBeUndefined();
              // And, per App.jsx, karyawan has no secondary tabs at all.
              expect(secondaryTabs).toEqual([]);
            }

            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: false,
        }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Source of truth (continued) — redirect + renderContent logic for analytics
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

/**
 * Mirrors the `case 'analytics':` branch of `renderContent()` in App.jsx:
 *
 *   case 'analytics':
 *     return (userRole === 'admin' || userRole === 'super_admin')
 *       ? <AnalyticsDashboard key={key} />
 *       : null;
 *
 * Returns the string `'AnalyticsDashboard'` when the component would be
 * rendered, or `null` otherwise. Used purely to assert that the
 * `AnalyticsDashboard` is not rendered for non-admin roles even if the
 * `analytics` tab is somehow active.
 */
function renderAnalyticsBranch(role) {
  return role === 'admin' || role === 'super_admin'
    ? 'AnalyticsDashboard'
    : null;
}

// ---------------------------------------------------------------------------
// Property 2: Redirect karyawan dari tab analytics
// ---------------------------------------------------------------------------

describe('App — Property 2: Redirect karyawan dari tab analytics', () => {
  /**
   * Property 2: Redirect karyawan dari tab analytics
   *
   * Feature: analytics-dashboard, Property 2: Redirect karyawan dari tab analytics
   *
   * For any state where `userRole === 'karyawan'` and the desired
   * `activeTab` is a tab the karyawan role is not allowed to see — most
   * notably `'analytics'` — the App SHALL redirect the active tab to the
   * default `'form'` and SHALL NOT render the `AnalyticsDashboard`
   * component.
   *
   * The property is asserted in three layers, from specific to general:
   *   1. The exact case from Requirement 1.6: role='karyawan',
   *      activeTab='analytics' → effective tab is 'form' and analytics is
   *      not rendered.
   *   2. For any tab id drawn from `allTabs`, role='karyawan' redirects
   *      every tab outside karyawan's allowed list back to 'form', and
   *      analytics specifically is never rendered for karyawan.
   *   3. For any (role, tabId) pair, the effective tab is always inside
   *      that role's allowed list — i.e. the redirect never leaves the
   *      user on a tab they are not permitted to view.
   *
   * Validates: Requirements 1.6
   */
  it(
    'Property 2: karyawan dengan activeTab="analytics" dialihkan ke "form" tanpa merender AnalyticsDashboard',
    () => {
      // Layer 1: the explicit, deterministic case from the requirement.
      // Wrapped in fc.constant so it participates in the same property
      // harness (and is checked across the full numRuns budget).
      fc.assert(
        fc.property(
          fc.constant('karyawan'),
          fc.constant('analytics'),
          (userRole, desiredTab) => {
            const effective = effectiveActiveTab(userRole, desiredTab);
            // Redirect: activeTab is forced to 'form'.
            expect(effective).toBe('form');
            // And the analytics renderContent branch returns null for
            // karyawan, even if it had somehow been reached.
            expect(renderAnalyticsBranch(userRole)).toBeNull();
            return true;
          }
        ),
        { numRuns: 100, verbose: false }
      );

      // Layer 2: generalised over every tab id for role='karyawan'.
      // Confirms the redirect mechanism is correct for the whole tab space,
      // and that analytics is never rendered for karyawan.
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
              // Disallowed tabs (including 'analytics') are redirected
              // back to the default 'form' tab.
              expect(effective).toBe('form');
            }

            // Karyawan never renders the AnalyticsDashboard, regardless of
            // which tab was attempted.
            expect(renderAnalyticsBranch(userRole)).toBeNull();
            return true;
          }
        ),
        { numRuns: 100, verbose: false }
      );

      // Layer 3: generalised over every role × tab combination.
      // The redirect must always settle the user on a tab inside their
      // allowed list — i.e. it is impossible to be stuck on a forbidden
      // tab after the effect runs.
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

            // Specifically: if karyawan ever lands on 'analytics' as the
            // desired tab, the effective tab is never 'analytics'.
            if (userRole === 'karyawan' && desiredTab === 'analytics') {
              expect(effective).not.toBe('analytics');
              expect(effective).toBe('form');
            }

            return true;
          }
        ),
        { numRuns: 100, verbose: false }
      );
    }
  );
});
