import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrendCard, pointFor } from './TrendCard';
import type { Snapshot } from '../types';

const emptyLatest = {
  scrapedAt: '2026-08-19T00:00:00Z',
  global: {
    inventory: { totalLiters: 0, stationsAvailable: 0, stationsTotal: 0 },
    pressure: { score: null, state: 'BASELINE_BUILDING' as const, mode: 'PROVISIONAL' as const },
  },
};

describe('TrendCard', () => {
  test('shows the provisional-mode badge and empty state with no history yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(<TrendCard latest={emptyLatest} />);

    await waitFor(() => expect(screen.getByText('Aún no hay suficiente histórico')).toBeInTheDocument());
    expect(screen.getByText('ÍNDICE PROVISIONAL')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  test('toggling a legend item marks it disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    render(<TrendCard latest={null} />);

    const legendButton = await screen.findByText('Saldo total (litros)');
    expect(legendButton.closest('button')).toHaveClass('active');
    fireEvent.click(legendButton);
    expect(legendButton.closest('button')).toHaveClass('disabled');

    vi.unstubAllGlobals();
  });
});

describe('pointFor', () => {
  test('sums liters/flow only from Santa Cruz stations, ignoring the global (all-station) totals', () => {
    const snapshot: Snapshot = {
      scrapedAt: '2026-08-20T00:00:00Z',
      global: {
        // Deliberately different from the per-station sum below, to prove
        // pointFor recomputes from `stations` instead of trusting this.
        inventory: { totalLiters: 999999, stationsAvailable: 99, stationsTotal: 99 },
        pressure: { score: 50, state: 'EQUILIBRIO' },
        flow: { outflowLitersPerHour: 999999, inflowLitersPerHour: 999999, netFlowLitersPerHour: 0 },
      },
      stations: [
        {
          key: 'alemana',
          name: 'ALEMANA',
          liters: 1000,
          fuelLevel: { score: 4, state: 'CRITICO' },
          pressure: { score: 0, state: 'SIN_PRESION' },
          flow: { outflowLitersPerHour: 100, inflowLitersPerHour: 0, netFlowLitersPerHour: -100 },
        },
        {
          // Out of Santa Cruz — must not contribute to the sums.
          key: 'cedeno',
          name: 'CEDENO',
          liters: 5000,
          fuelLevel: { score: 20, state: 'CRITICO' },
          pressure: { score: 0, state: 'SIN_PRESION' },
          flow: { outflowLitersPerHour: 500, inflowLitersPerHour: 200, netFlowLitersPerHour: -300 },
        },
      ],
    };

    const point = pointFor(snapshot);
    expect(point.liters).toBe(1000);
    expect(point.outflowLitersPerHour).toBe(100);
    expect(point.inflowLitersPerHour).toBe(0);
    expect(point.score).toBe(50); // pressure score stays the official (all-station) one
  });
});
