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
// Mock supabase BEFORE importing any section component (which transitively
// imports useRpcQuery → @/lib/customSupabaseClient).
// ---------------------------------------------------------------------------
vi.mock('@/lib/customSupabaseClient', () => {
  const rpcMock = vi.fn();
  return {
    supabase: {
      rpc: rpcMock,
      from: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
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

import { supabase } from '@/lib/customSupabaseClient';
import OccupancyByLocationSection from './OccupancyByLocationSection';
import ProfitSection from './ProfitSection';
import CheckinHeatmapSection from './CheckinHeatmapSection';
import GuestSourceSection from './GuestSourceSection';
import RepeatGuestSection from './RepeatGuestSection';
import LocationFullnessSection from './LocationFullnessSection';
import StayDurationSection from './StayDurationSection';
import DailyRevenueTrendSection from './DailyRevenueTrendSection';

// ---------------------------------------------------------------------------
// Section registry — RPC name ↔ Component ↔ Display name (used in SectionError)
// ---------------------------------------------------------------------------
const SECTIONS = [
  {
    rpcName: 'get_occupancy_per_location',
    Component: OccupancyByLocationSection,
    displayName: 'Okupansi per Lokasi Apartemen',
  },
  {
    rpcName: 'get_profit_per_location',
    Component: ProfitSection,
    displayName: 'Profit per Lokasi',
  },
  {
    rpcName: 'get_checkin_heatmap',
    Component: CheckinHeatmapSection,
    displayName: 'Jam Check-in Ramai',
  },
  {
    rpcName: 'get_guest_source_summary',
    Component: GuestSourceSection,
    displayName: 'Sumber Tamu',
  },
  {
    rpcName: 'get_repeat_guests',
    Component: RepeatGuestSection,
    displayName: 'Repeat Guest',
  },
  {
    rpcName: 'get_location_fullness',
    Component: LocationFullnessSection,
    displayName: 'Lokasi Sering Penuh',
  },
  {
    rpcName: 'get_stay_duration_summary',
    Component: StayDurationSection,
    displayName: 'Durasi Menginap',
  },
  {
    rpcName: 'get_daily_revenue_trend',
    Component: DailyRevenueTrendSection,
    displayName: 'Tren Pendapatan Harian',
  },
];

const RPC_NAMES = SECTIONS.map((s) => s.rpcName);

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
      {SECTIONS.map(({ rpcName, Component }) => (
        <Component key={rpcName} filter={filter} />
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
   * For any subset S ⊆ {8 RPC names} with |S| ∈ [1, 8]:
   *   - Mock supabase.rpc to return { data: null, error } for every rpcName ∈ S
   *     and { data: [], error: null } for every rpcName ∉ S.
   *   - After all section fetches settle:
   *       * For every section whose rpcName ∈ S, its SectionError header
   *         "<displayName>: Data tidak tersedia" SHALL be present in the DOM.
   *       * For every section whose rpcName ∉ S, that header SHALL NOT be
   *         present (the section renders SectionEmpty instead, since data=[]).
   *
   * Validates: Requirements 2.6, 5.6
   */
  it(
    'Property 6: section yang gagal menampilkan SectionError, section lain tidak terpengaruh',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(RPC_NAMES, { minLength: 1, maxLength: RPC_NAMES.length }),
          async (failingRpcs) => {
            const failingSet = new Set(failingRpcs);

            // Configure the supabase.rpc mock for this iteration.
            supabase.rpc.mockImplementation((rpcName) => {
              if (failingSet.has(rpcName)) {
                return Promise.resolve({
                  data: null,
                  error: { message: `Forced fail for ${rpcName}` },
                });
              }
              return Promise.resolve({ data: [], error: null });
            });

            const { unmount } = render(<AllSections filter={FILTER} />);

            // Wait until every failing section has rendered its SectionError
            // header. Once all failing sections have settled, the non-failing
            // sections have necessarily settled too (they share the same
            // microtask queue and useEffect schedule).
            await waitFor(() => {
              for (const { rpcName, displayName } of SECTIONS) {
                if (!failingSet.has(rpcName)) continue;
                const matches = screen.queryAllByText(
                  sectionErrorRegex(displayName)
                );
                expect(matches.length).toBeGreaterThan(0);
              }
            });

            // Verify isolation: every NON-failing section must NOT show its
            // SectionError header. Since data=[], they render SectionEmpty.
            for (const { rpcName, displayName } of SECTIONS) {
              if (failingSet.has(rpcName)) continue;
              const matches = screen.queryAllByText(
                sectionErrorRegex(displayName)
              );
              expect(matches.length).toBe(0);
            }

            // And, for completeness, the failing sections each show exactly
            // one SectionError header (one per display name).
            for (const { rpcName, displayName } of SECTIONS) {
              if (!failingSet.has(rpcName)) continue;
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
