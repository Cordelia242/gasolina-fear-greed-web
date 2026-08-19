import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StationDialog } from './StationDialog';
import type { Station } from '../types';

const station: Station = {
  key: 'a',
  name: 'ALEMANA',
  liters: 100,
  fuelLevel: { score: 50, state: 'NORMAL' },
  pressure: { score: null, state: 'BASELINE_BUILDING' },
};

describe('StationDialog', () => {
  test('shows the baseline label when the station has no pressure score yet', () => {
    render(<StationDialog station={station} saldosRecords={[]} onClose={vi.fn()} />);
    expect(screen.getByText('BASELINE EN CONSTRUCCIÓN')).toBeInTheDocument();
  });

  test('renders nothing visible when no station is selected', () => {
    render(<StationDialog station={null} saldosRecords={[]} onClose={vi.fn()} />);
    expect(screen.queryByText('ALEMANA')).not.toBeInTheDocument();
  });
});
