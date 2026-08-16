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

// Mock the REST API client module
vi.mock('@/api/client', () => {
  const getMock = vi.fn();
  return {
    api: {
      get: getMock,
    },
  };
});

import { api } from '@/api/client';

// Large total_count so that any page 1–100 with any pageSize 1–100 is within totalPages
// totalPages = ceil(total_count / pageSize) >= ceil(10000 / 100) = 100
const LARGE_TOTAL_COUNT = 10000;

describe('useRpcQuery — Property 7: Pagination params dikirim dengan benar ke REST API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRpcCache();
    api.get.mockResolvedValue({
      data: [{ total_count: LARGE_TOTAL_COUNT }],
      pagination: { total: LARGE_TOTAL_COUNT, page: 1, limit: 10, totalPages: 1000 },
    });
  });

  /**
   * Property 7: Pagination params dikirim dengan benar ke REST API
   *
   * For any currentPage (1–100) and pageSize (1–100), useRpcQuery SHALL call
   * api.get() with page and limit query params correctly.
   *
   * Validates: Requirements 4.4, 7.5, 8.5, 11.5, 12.4
   */
  it(
    'Property 7: untuk sembarang currentPage dan pageSize, page dan limit dikirim dengan benar ke REST API',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }), // currentPage
          fc.integer({ min: 1, max: 100 }), // pageSize
          async (page, pageSize) => {
            vi.clearAllMocks();
            clearRpcCache();
            api.get.mockResolvedValue({
              data: [{ total_count: LARGE_TOTAL_COUNT }],
              pagination: { total: LARGE_TOTAL_COUNT, page, limit: pageSize, totalPages: 1000 },
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
              const calls = api.get.mock.calls;
              expect(calls.length).toBeGreaterThan(0);
              const lastCall = calls[calls.length - 1];
              expect(lastCall[0]).toBe('/api/analytics/test-rpc');
              expect(lastCall[1]).toMatchObject({
                page: 1,
                limit: pageSize,
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

              // Verify the last API call used the correct pagination params
              const calls = api.get.mock.calls;
              expect(calls.length).toBeGreaterThan(0);
              const lastCall = calls[calls.length - 1];

              expect(lastCall[0]).toBe('/api/analytics/test-rpc');
              expect(lastCall[1]).toMatchObject({
                page: page,
                limit: pageSize,
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
 * Property 8: Filter params diteruskan ke REST API dengan benar
 *
 * Feature: analytics-dashboard
 * Property 8: Filter params diteruskan ke REST API dengan benar
 *
 * Validates: Requirements 4.5, 12.2, 12.5, 12.6
 */
describe('useRpcQuery — Property 8: Filter params diteruskan ke REST API dengan benar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRpcCache();
    api.get.mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
  });

  /**
   * Property 8: Filter params diteruskan ke REST API dengan benar
   *
   * For any combination of appliedFilter (startDate, endDate, location including null),
   * useRpcQuery SHALL call api.get() with startDate, endDate, and location
   * matching the provided params (normalized from p_* convention).
   *
   * Validates: Requirements 4.5, 12.2, 12.5, 12.6
   */
  it(
    'Property 8: untuk sembarang kombinasi filter params, startDate, endDate, dan location diteruskan ke REST API dengan benar',
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
            api.get.mockResolvedValue({
              data: [],
              pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
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

            // Verify api.get was called with the correct filter params
            const calls = api.get.mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            const lastCall = calls[calls.length - 1];

            expect(lastCall[0]).toBe('/api/analytics/test-rpc');
            // Params are normalized from p_* to camelCase
            expect(lastCall[1]).toMatchObject({
              startDate: p_start_date,
              endDate: p_end_date,
              location: p_location,
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
