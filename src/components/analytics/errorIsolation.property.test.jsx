/**
 * Property-Based Tests — Error Isolation antar Section
 *
 * Feature: analytics-dashboard
 * Property 6: Error isolation antar section
 *
 * Untuk sembarang kombinasi section yang gagal (1–8 dari 8 section), section
 * yang mengalami error SHALL menampilkan SectionError, sedangkan section
 * lainnya SHALL tetap menampilkan data/empty/loading state mereka tanpa
 * terpengaruh.
 *
 * Validates: Requirements 2.6, 5.6
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @/api/client BEFORE importing any section component (which transitively
// imports useRpcQuery → @/api/client).
// ---------------------------------------------------------------------------
vi.mock('@/api/client', () => {
  const getMock = vi.fn();
  return {
    api: {
      get: getMock,
    },
  };
});

// Stub PaginationControls — paginated sections render it, but we don't need
// pagination interactions in this test. Returning null also avoids any issues
// when totalItems happens to be > 0.
vi.mock('@/components/PaginationControls', () => ({
  default: () => null,
}));

// Stub Recharts to avoid rendering charts in jsdom. With our mocked RPC
// responses (data = [] for non-failing sections, error for failing sections),
// no chart should render anyway, but we guard defensively in case any section
// renders a chart placeholder before checking data.
vi.mock('recharts', () => {
  const stub = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: stub,
    BarChart: stub,
    Bar: stub,
    Cell: stub,
    XAxis: stub,
    YAxis: stub,
    CartesianGrid: stub,
    Tooltip: stub,
    Legend: stub,
    PieChart: stub,
    Pie: stub,
    LineChart: stub,
    Line: stub,
  };
});

import { api } from '@/api/client';
import { clearRpcCache } from '@/hooks/useRpcQuery';
import OccupancyByLocationSection from './OccupancyByLocationSection';
import ProfitSection from './ProfitSection';
import CheckinHeatmapSection from './CheckinHeatmapSection';
import GuestSourceSection from './GuestSourceSection';
import RepeatGuestSection from './RepeatGuestSection';
import LocationFullnessSection from './LocationFullnessSection';
import StayDurationSection from './StayDurationSection';
import DailyRevenueTrendSection from './DailyRevenueTrendSection';

// ---------------------------------------------------------------------------
// Section registry — API endpoint ↔ Component ↔ Display name (used in SectionError)
// ---------------------------------------------------------------------------
const SECTIONS = [
  {
    endpoint: '/api/analytics/occupancy-by-location',
    Component: OccupancyByLocationSection,
    displayName: 'Okupansi per Lokasi Apartemen',
  },
  {
    endpoint: '/api/analytics/profit-per-location',
    Component: ProfitSection,
    displayName: 'Profit per Lokasi',
  },
  {
    endpoint: '/api/analytics/checkin-heatmap',
    Component: CheckinHeatmapSection,
    displayName: 'Jam Check-in Ramai',
  },
  {
    endpoint: '/api/analytics/guest-sources',
    Component: GuestSourceSection,
    displayName: 'Sumber Tamu',
  },
  {
    endpoint: '/api/analytics/repeat-guests',
    Component: RepeatGuestSection,
    displayName: 'Repeat Guest',
  },
  {
    endpoint: '/api/analytics/location-fullness',
    Component: LocationFullnessSection,
    displayName: 'Lokasi Sering Penuh',
  },
  {
    endpoint: '/api/analytics/stay-duration',
    Component: StayDurationSection,
    displayName: 'Durasi Menginap',
  },
  {
    endpoint: '/api/analytics/daily-revenue',
    Component: DailyRevenueTrendSection,
    displayName: 'Tren Pendapatan Harian',
  },
];

const ENDPOINTS = SECTIONS.map((s) => s.endpoint);

// Helper: build a regex matching the SectionError header for a display name.
// SectionError renders: "<displayName>: Data tidak tersedia".
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function sectionErrorRegex(displayName) {
  return new RegExp(`${escapeRegex(displayName)}: Data tidak tersedia`, 'i');
}

// Test harness: render all 8 sections side-by-side with a shared filter.
function AllSections({ filter }) {
  return (
    <div>
      {SECTIONS.map(({ endpoint, Component }) => (
        <Component key={endpoint} filter={filter} />
      ))}
    </div>
  );
}

const FILTER = {
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  location: null,
};

// ---------------------------------------------------------------------------
// Property 6: Error isolation antar section
// ---------------------------------------------------------------------------

describe('Analytics Sections — Property 6: Error isolation antar section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Property 6: Error isolation antar section
   *
   * Feature: analytics-dashboard, Property 6: Error isolation antar section
   *
   * For any subset S ⊆ {8 API endpoints} with |S| ∈ [1, 8]:
   *   - Mock api.get to throw error for every endpoint ∈ S
   *     and return { data: [] } for every endpoint ∉ S.
   *   - After all section fetches settle:
   *       * For every section whose endpoint ∈ S, its SectionError header
   *         "<displayName>: Data tidak tersedia" SHALL be present in the DOM.
   *       * For every section whose endpoint ∉ S, that header SHALL NOT be
   *         present (the section renders SectionEmpty instead, since data=[]).
   *
   * Validates: Requirements 2.6, 5.6
   */
  it(
    'Property 6: section yang gagal menampilkan SectionError, section lain tidak terpengaruh',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(ENDPOINTS, { minLength: 1, maxLength: ENDPOINTS.length }),
          async (failingEndpoints) => {
            const failingSet = new Set(failingEndpoints);
            clearRpcCache();

            // Configure the api.get mock for this iteration.
            api.get.mockImplementation((endpoint) => {
              if (failingSet.has(endpoint)) {
                return Promise.reject(new Error(`Forced fail for ${endpoint}`));
              }
              return Promise.resolve({ data: [] });
            });

            const { unmount } = render(<AllSections filter={FILTER} />);

            // Wait until every failing section has rendered its SectionError
            // header. Once all failing sections have settled, the non-failing
            // sections have necessarily settled too (they share the same
            // microtask queue and useEffect schedule).
            await waitFor(() => {
              for (const { endpoint, displayName } of SECTIONS) {
                if (!failingSet.has(endpoint)) continue;
                const matches = screen.queryAllByText(
                  sectionErrorRegex(displayName)
                );
                expect(matches.length).toBeGreaterThan(0);
              }
            });

            // Verify isolation: every NON-failing section must NOT show its
            // SectionError header. Since data=[], they render SectionEmpty.
            for (const { endpoint, displayName } of SECTIONS) {
              if (failingSet.has(endpoint)) continue;
              const matches = screen.queryAllByText(
                sectionErrorRegex(displayName)
              );
              expect(matches.length).toBe(0);
            }

            // And, for completeness, the failing sections each show exactly
            // one SectionError header (one per display name).
            for (const { endpoint, displayName } of SECTIONS) {
              if (!failingSet.has(endpoint)) continue;
              const matches = screen.queryAllByText(
                sectionErrorRegex(displayName)
              );
              expect(matches.length).toBe(1);
            }

            unmount();
          }
        ),
        {
          numRuns: 100,
          verbose: false,
        }
      );
    },
    180000 // 180s timeout — 100 runs × 8 sections per render is non-trivial
  );
});
