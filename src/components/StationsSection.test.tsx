import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StationsSection } from './StationsSection';
import type { Station } from '../types';

const stations: Station[] = [
  { key: 'a', name: 'ALEMANA', liters: 100, fuelLevel: { score: 50, state: 'NORMAL' }, pressure: { score: 0, state: 'SIN_PRESION' } },
  { key: 'b', name: 'BENI', liters: 0, fuelLevel: { score: 0, state: 'CRITICO' }, pressure: { score: 100, state: 'PRESION_EXTREMA' } },
];

describe('StationsSection', () => {
  test('filters to stations with saldo', () => {
    render(<StationsSection stations={stations} saldosRecords={[]} onOpenStation={vi.fn()} />);
    expect(screen.getByText('ALEMANA')).toBeInTheDocument();
    expect(screen.getByText('BENI')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Con saldo'));
    expect(screen.getByText('ALEMANA')).toBeInTheDocument();
    expect(screen.queryByText('BENI')).not.toBeInTheDocument();
  });

  test('opens the dialog for the clicked station', () => {
    const onOpen = vi.fn();
    render(<StationsSection stations={stations} saldosRecords={[]} onOpenStation={onOpen} />);
    fireEvent.click(screen.getByText('ALEMANA'));
    expect(onOpen).toHaveBeenCalledWith('a');
  });
});
