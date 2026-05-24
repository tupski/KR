/**
 * Property-Based Tests for useRpcQuery
 *
 * Feature: analytics-dashboard
 * Property 7: Pagination params dikirim dengan benar ke RPC
 *
 * Validates: Requirements 4.4, 7.5, 8.5, 11.5, 12.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { useRpcQuery, clearRpcCache } from './useRpcQuery';

// Mock the supabase client module
vi.mock('@/lib/customSupabaseClient', () => {
  const rpcMock = vi.fn();
  return {
    supabase: {
      rpc: rpcMock,
    },
  };
});

import { supabase } from '@/lib/customSupabaseClient';

// Large total_count so that any page 1–100 with any pageSize 1–100 is within totalPages
// totalPages = ceil(total_count / pageSize) >= ceil(10000 / 100) = 100
const LARGE_TOTAL_COUNT = 10000;

describe('useRpcQuery — Property 7: Pagination params dikirim dengan benar ke RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRpcCache();
    supabase.rpc.mockResolvedValue({
      data: [{ total_count: LARGE_TOTAL_COUNT }],
      error: null,
    });
  });

  /**
   * Property 7: Pagination params dikirim dengan benar ke RPC
   *
   * For any currentPage (1–100) and pageSize (1–100), useRpcQuery SHALL call
   * supabase.rpc() with p_limit = pageSize and p_offset = (currentPage - 1) * pageSize.
   *
   * Validates: Requirements 4.4, 7.5, 8.5, 11.5, 12.4
   */
  it(
    'Property 7: untuk sembarang currentPage dan pageSize, p_limit dan p_offset dikirim dengan benar ke RPC',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }), // currentPage
          fc.integer({ min: 1, max: 100 }), // pageSize
          async (page, pageSize) => {
            vi.clearAllMocks();
            clearRpcCache();
            supabase.rpc.mockResolvedValue({
              data: [{ total_count: LARGE_TOTAL_COUNT }],
              error: null,
            });

            const { result, unmount } = renderHook(() =>
              useRpcQuery({
                rpcName: 'test_rpc',
                params: { p_start_date: '2024-01-01', p_end_date: '2024-01-31' },
                pageSize,
                paginated: true,
                enabled: true,
              })
            );

            // Wait for initial fetch (page 1) to complete
            await waitFor(() => {
              expect(result.current.isLoading).toBe(false);
            });

            if (page === 1) {
              // Page 1 is the initial state — verify the initial fetch call
              const calls = supabase.rpc.mock.calls;
              expect(calls.length).toBeGreaterThan(0);
              const lastCall = calls[calls.length - 1];
              expect(lastCall[0]).toBe('test_rpc');
              expect(lastCall[1]).toMatchObject({
                p_limit: pageSize,
                p_offset: 0,
              });
            } else {
              // Navigate to the target page
              // With LARGE_TOTAL_COUNT=10000 and pageSize 1–100, totalPages >= 100,
              // so page 1–100 is always within bounds (no clamping occurs)
              act(() => {
                result.current.setPage(page);
              });

              // Wait for the navigation fetch to complete
              await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
              });

              // Verify the last RPC call used the correct pagination params
              const calls = supabase.rpc.mock.calls;
              expect(calls.length).toBeGreaterThan(0);
              const lastCall = calls[calls.length - 1];
              const expectedOffset = (page - 1) * pageSize;

              expect(lastCall[0]).toBe('test_rpc');
              expect(lastCall[1]).toMatchObject({
                p_limit: pageSize,
                p_offset: expectedOffset,
              });
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    60000 // 60s timeout for 100 property runs
  );
});

/**
 * Property 8: Filter params diteruskan ke RPC dengan benar
 *
 * Feature: analytics-dashboard
 * Property 8: Filter params diteruskan ke RPC dengan benar
 *
 * Validates: Requirements 4.5, 12.2, 12.5, 12.6
 */
describe('useRpcQuery — Property 8: Filter params diteruskan ke RPC dengan benar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRpcCache();
    supabase.rpc.mockResolvedValue({
      data: [],
      error: null,
    });
  });

  /**
   * Property 8: Filter params diteruskan ke RPC dengan benar
   *
   * For any combination of appliedFilter (startDate, endDate, location including null),
   * useRpcQuery SHALL call supabase.rpc() with p_start_date, p_end_date, and p_location
   * matching the provided params exactly.
   *
   * Validates: Requirements 4.5, 12.2, 12.5, 12.6
   */
  it(
    'Property 8: untuk sembarang kombinasi filter params, p_start_date, p_end_date, dan p_location diteruskan ke RPC dengan benar',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            p_start_date: fc.string(),
            p_end_date: fc.string(),
            p_location: fc.option(fc.string(), { nil: null }),
          }),
          async ({ p_start_date, p_end_date, p_location }) => {
            vi.clearAllMocks();
            clearRpcCache();
            supabase.rpc.mockResolvedValue({
              data: [],
              error: null,
            });

            const params = { p_start_date, p_end_date, p_location };

            const { result, unmount } = renderHook(() =>
              useRpcQuery({
                rpcName: 'test_rpc',
                params,
                pageSize: 10,
                paginated: true,
                enabled: true,
              })
            );

            // Wait for the fetch to complete
            await waitFor(() => {
              expect(result.current.isLoading).toBe(false);
            });

            // Verify supabase.rpc was called with the correct filter params
            const calls = supabase.rpc.mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            const lastCall = calls[calls.length - 1];

            expect(lastCall[0]).toBe('test_rpc');
            expect(lastCall[1]).toMatchObject({
              p_start_date,
              p_end_date,
              p_location,
            });

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    60000 // 60s timeout for 100 property runs
  );
});
