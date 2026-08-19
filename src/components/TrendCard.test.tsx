import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrendCard } from './TrendCard';

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
