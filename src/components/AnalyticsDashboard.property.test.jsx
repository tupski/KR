/**
 * Property-Based Tests for AnalyticsDashboard / GlobalFilterBar
 *
 * Feature: analytics-dashboard
 * Property 3: Nilai default filter sesuai tanggal render
 * Property 4: Validasi rentang tanggal filter
 * Property 5: Tombol preset filter menghasilkan rentang yang benar
 *
 * Validates: Requirements 2.3, 3.1, 3.3, 3.4, 3.5, 3.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import {
  format,
  startOfMonth,
  differenceInDays,
  parseISO,
  subDays,
  subMonths,
  endOfMonth,
} from 'date-fns';

// ---------------------------------------------------------------------------
// Mock @/lib/customSupabaseClient to prevent actual Supabase calls
// ---------------------------------------------------------------------------
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
  },
}));

// Import component AFTER mocks are set up
import AnalyticsDashboard from './AnalyticsDashboard';

// ---------------------------------------------------------------------------
// Helper: compute expected default dates for a given render date T
// ---------------------------------------------------------------------------
function expectedDefaults(T) {
  return {
    startDate: format(startOfMonth(T), 'yyyy-MM-dd'),
    endDate: format(T, 'yyyy-MM-dd'),
  };
}

// ---------------------------------------------------------------------------
// Property 3: Nilai default filter sesuai tanggal render
// ---------------------------------------------------------------------------

describe('GlobalFilterBar — Property 3: Nilai default filter sesuai tanggal render', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Property 3: Nilai default filter sesuai tanggal render
   *
   * For any date T in 2020–2030, when AnalyticsDashboard is rendered with the
   * system time mocked to T:
   *   - The "Tanggal Mulai" input SHALL have value = format(startOfMonth(T), 'yyyy-MM-dd')
   *   - The "Tanggal Selesai" input SHALL have value = format(T, 'yyyy-MM-dd')
   *
   * Validates: Requirements 2.3, 3.1
   */
  it(
    'Property 3: untuk sembarang tanggal render T, startDate default = hari pertama bulan T dan endDate default = T',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({
            min: new Date('2020-01-01T00:00:00.000Z'),
            max: new Date('2030-12-31T23:59:59.999Z'),
          }),
          async (T) => {
            // Pin system time to T BEFORE rendering so the useState initialisers
            // (which call new Date() via firstOfMonth() and today()) observe T.
            // Copy: fast-check shrinks by mutating the Date (setTime), which would
            // otherwise corrupt the pinned fake clock → new Date(NaN) flake.
            vi.setSystemTime(new Date(T.getTime()));

            const { unmount } = render(<AnalyticsDashboard />);

            const expected = expectedDefaults(T);

            // Find the two date inputs by their associated label.
            const startInput = screen.getByLabelText(/Tanggal Mulai/i);
            const endInput = screen.getByLabelText(/Tanggal Selesai/i);

            expect(startInput.value).toBe(expected.startDate);
            expect(endInput.value).toBe(expected.endDate);

            unmount();
          }
        ),
        {
          numRuns: 100,
          verbose: false,
        }
      );
    },
    60000 // 60s timeout for 100 property runs
  );
});

// ---------------------------------------------------------------------------
// Property 4: Validasi rentang tanggal filter
// ---------------------------------------------------------------------------

/**
 * Format a JS Date to 'yyyy-MM-dd' (date-fns).
 */
function toISODate(d) {
  return format(d, 'yyyy-MM-dd');
}

describe('GlobalFilterBar — Property 4: Validasi rentang tanggal filter', () => {
  beforeEach(() => {
    // No fake timers needed here — we drive the inputs explicitly via fireEvent.
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Property 4: Validasi rentang tanggal filter
   *
   * For any pair of dates (startDate, endDate) drawn from a wide range
   * (2020-01-01 .. 2025-12-31), when both inputs are set on the rendered
   * GlobalFilterBar and the "Terapkan Filter" button is clicked:
   *
   *   - IF startDate > endDate (lexicographic on 'yyyy-MM-dd', equivalent to
   *     calendar comparison) THEN the DOM SHALL contain the message
   *     "Tanggal mulai tidak boleh lebih besar dari tanggal selesai"
   *     and SHALL NOT contain the message "Rentang tanggal maksimal 366 hari".
   *
   *   - ELSE IF differenceInDays(endDate, startDate) > 366 THEN the DOM SHALL
   *     contain the message "Rentang tanggal maksimal 366 hari".
   *
   *   - ELSE (startDate <= endDate AND diff <= 366) THEN the DOM SHALL NOT
   *     contain either error message.
   *
   * Validates: Requirements 3.3, 3.4, 3.5
   */
  it(
    'Property 4: error jika startDate > endDate ATAU selisih > 366 hari; valid jika startDate <= endDate DAN selisih <= 366',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.date({
              min: new Date('2020-01-01T00:00:00.000Z'),
              max: new Date('2025-12-31T23:59:59.999Z'),
              noInvalidDate: true,
            }),
            fc.date({
              min: new Date('2020-01-01T00:00:00.000Z'),
              max: new Date('2025-12-31T23:59:59.999Z'),
              noInvalidDate: true,
            })
          ),
          async ([d1, d2]) => {
            const startDate = toISODate(d1);
            const endDate = toISODate(d2);

            const { container, unmount } = render(<AnalyticsDashboard />);

            // Find the two date inputs. The component now uses htmlFor-linked
            // labels, but we use querySelectorAll for parity with the existing
            // Property 5 approach in the same file.
            const dateInputs = container.querySelectorAll('input[type="date"]');
            expect(dateInputs.length).toBe(2);

            const [startInput, endInput] = dateInputs;

            // Drive both inputs to the generated values.
            fireEvent.change(startInput, { target: { value: startDate } });
            fireEvent.change(endInput, { target: { value: endDate } });

            // Click "Terapkan Filter".
            const applyBtn = screen.getByRole('button', {
              name: /Terapkan Filter/i,
            });
            fireEvent.click(applyBtn);

            // Compute expected outcome using the same logic as the component.
            const startGreaterThanEnd = startDate > endDate;
            const diffDays = differenceInDays(
              parseISO(endDate),
              parseISO(startDate)
            );
            const rangeTooLong = !startGreaterThanEnd && diffDays > 366;
            const isValid = !startGreaterThanEnd && !rangeTooLong;

            const orderError = screen.queryByText(
              /Tanggal mulai tidak boleh lebih besar dari tanggal selesai/i
            );
            const rangeError = screen.queryByText(
              /Rentang tanggal maksimal 366 hari/i
            );

            if (startGreaterThanEnd) {
              // Order error must be shown; range error must NOT be shown
              // (component returns early on the first failed check).
              expect(orderError).not.toBeNull();
              expect(rangeError).toBeNull();
            } else if (rangeTooLong) {
              // Range error must be shown; order error must NOT be shown.
              expect(rangeError).not.toBeNull();
              expect(orderError).toBeNull();
            } else {
              // Valid input: neither error message is in the DOM.
              expect(isValid).toBe(true);
              expect(orderError).toBeNull();
              expect(rangeError).toBeNull();
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
    120000 // 120s timeout for 100 property runs (renders + clicks)
  );
});

// ---------------------------------------------------------------------------
// Property 5: Tombol preset filter menghasilkan rentang yang benar
// ---------------------------------------------------------------------------

describe('GlobalFilterBar — Property 5: Tombol preset filter menghasilkan rentang yang benar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Property 5: Tombol preset filter menghasilkan rentang yang benar
   *
   * For any "today" T (random date 2020–2030), each preset button SHALL
   * produce the exact date range:
   *   - "Hari Ini"          → startDate = T,                          endDate = T
   *   - "7 Hari Terakhir"   → startDate = T - 6 days,                 endDate = T
   *   - "Bulan Ini"         → startDate = startOfMonth(T),            endDate = T
   *   - "Bulan Lalu"        → startDate = startOfMonth(T - 1 month),  endDate = endOfMonth(T - 1 month)
   *
   * Validates: Requirements 3.6
   */
  it(
    'Property 5: setiap preset menghasilkan rentang tanggal yang sesuai dengan tanggal hari ini T',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({
            min: new Date('2020-01-01T00:00:00.000Z'),
            max: new Date('2030-12-31T23:59:59.999Z'),
          }),
          async (T) => {
            // Pin system time to T BEFORE rendering so preset handlers
            // observe T when calling new Date().
            // Copy: fast-check shrinks by mutating the Date (setTime), which would
            // otherwise corrupt the pinned fake clock → new Date(NaN) flake.
            vi.setSystemTime(new Date(T.getTime()));

            const { container, unmount } = render(<AnalyticsDashboard />);

            // Locate the two date inputs (index 0 = startDate, index 1 = endDate).
            const dateInputs = container.querySelectorAll('input[type="date"]');
            expect(dateInputs.length).toBe(2);
            const [startInput, endInput] = dateInputs;

            const lastMonth = subMonths(T, 1);

            const presets = [
              {
                label: 'Hari Ini',
                expectedStart: format(T, 'yyyy-MM-dd'),
                expectedEnd: format(T, 'yyyy-MM-dd'),
              },
              {
                label: '7 Hari Terakhir',
                expectedStart: format(subDays(T, 6), 'yyyy-MM-dd'),
                expectedEnd: format(T, 'yyyy-MM-dd'),
              },
              {
                label: 'Bulan Ini',
                expectedStart: format(startOfMonth(T), 'yyyy-MM-dd'),
                expectedEnd: format(T, 'yyyy-MM-dd'),
              },
              {
                label: 'Bulan Lalu',
                expectedStart: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
                expectedEnd: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
              },
            ];

            for (const preset of presets) {
              const button = screen.getByRole('button', { name: preset.label });
              fireEvent.click(button);

              expect(startInput.value).toBe(preset.expectedStart);
              expect(endInput.value).toBe(preset.expectedEnd);
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
    120000 // 120s timeout for 100 property runs (renders + 4 clicks each)
  );
});
