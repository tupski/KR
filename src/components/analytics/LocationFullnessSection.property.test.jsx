/**
 * Property-Based Tests for LocationFullnessSection
 *
 * Feature: analytics-dashboard
 * Property 12: Occupancy rate NULL untuk lokasi tanpa total_rooms
 *
 * Validates: Requirements 9.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @/lib/customSupabaseClient — supabase.rpc('get_location_fullness', ...)
// is controlled per fc iteration via mockResolvedValue.
// ---------------------------------------------------------------------------
vi.mock('@/lib/customSupabaseClient', () => {
  const rpcMock = vi.fn();
  return {
    supabase: {
      rpc: rpcMock,
    },
  };
});

// PaginationControls is not used by LocationFullnessSection (paginated: false),
// but mock defensively to keep the rendered DOM minimal in case of future imports.
vi.mock('@/components/PaginationControls', () => ({ default: () => null }));

// Import component AFTER mocks are set up.
import LocationFullnessSection from './LocationFullnessSection';
import { supabase } from '@/lib/customSupabaseClient';
import { clearRpcCache } from '@/hooks/useRpcQuery';

const FILTER = {
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  location: null,
};

describe('LocationFullnessSection — Property 12: Occupancy rate NULL untuk lokasi tanpa total_rooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Property 12: Occupancy rate NULL untuk lokasi tanpa total_rooms
   *
   * For any location row with `total_rooms = 0` or `total_rooms = null`, the
   * RPC `get_location_fullness` returns `avg_occupancy_rate = NULL` and
   * `peak_occupancy_rate = NULL`. The `LocationFullnessSection` component
   * SHALL render the literal "-" in both the "Rata-rata Occupancy Rate" and
   * "Peak Occupancy Rate" cells for every such row.
   *
   * Validates: Requirements 9.5
   */
  it(
    'Property 12: untuk sembarang lokasi dengan total_rooms = 0 atau NULL, kolom occupancy rate menampilkan "-"',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              apartment_location: fc
                .string({ minLength: 1, maxLength: 20 })
                .filter((s) => s.trim().length > 0),
              total_rooms: fc.oneof(fc.constant(0), fc.constant(null)),
              peak_occupancy_rate: fc.constant(null),
              avg_occupancy_rate: fc.constant(null),
              total_transactions: fc.integer({ min: 0, max: 100 }),
              total_count: fc.integer({ min: 1, max: 10 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (rows) => {
            vi.clearAllMocks();
            clearRpcCache();
            supabase.rpc.mockResolvedValue({ data: rows, error: null });

            const { container, unmount } = render(
              <LocationFullnessSection filter={FILTER} />
            );

            // Wait until the table has rendered all rows from the RPC mock.
            await waitFor(() => {
              const tbodyRows = container.querySelectorAll('tbody tr');
              expect(tbodyRows.length).toBe(rows.length);
            });

            // Sanity check: the RPC was called with the expected name.
            expect(supabase.rpc).toHaveBeenCalled();
            expect(supabase.rpc.mock.calls[0][0]).toBe('get_location_fullness');

            // For every rendered row, columns 2 (Rata-rata Occupancy Rate)
            // and 3 (Peak Occupancy Rate) must display the literal "-".
            const tbodyRows = container.querySelectorAll('tbody tr');
            tbodyRows.forEach((tr) => {
              const cells = tr.querySelectorAll('td');
              expect(cells.length).toBe(5);
              expect(cells[2].textContent).toBe('-');
              expect(cells[3].textContent).toBe('-');
            });

            unmount();
          }
        ),
        { numRuns: 100, verbose: false }
      );
    },
    120000 // 120s timeout for 100 property runs (renders + async waits)
  );
});
