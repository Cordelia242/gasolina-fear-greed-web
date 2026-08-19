import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GaugeCard } from './GaugeCard';

describe('GaugeCard', () => {
  test('shows -- and the baseline label when there is no pressure data yet', () => {
    render(<GaugeCard />);
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('BASELINE EN CONSTRUCCIÓN')).toBeInTheDocument();
  });

  test('renders the rounded score, state label, mode and stats', () => {
    const fmt = new Intl.NumberFormat('es-BO');
    render(
      <GaugeCard
        global={{
          inventory: { totalLiters: 140200, stationsAvailable: 15, stationsTotal: 19 },
          pressure: { score: 49.04, state: 'EQUILIBRIO', mode: 'PROVISIONAL' },
        }}
      />
    );
    expect(screen.getByText('49')).toBeInTheDocument();
    expect(screen.getByText('EQUILIBRIO')).toBeInTheDocument();
    expect(screen.getByText('ÍNDICE PROVISIONAL')).toBeInTheDocument();
    expect(screen.getByText(`${fmt.format(140200)} L`)).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });
});
