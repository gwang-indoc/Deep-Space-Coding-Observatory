import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StatusHud from '../src/hud/StatusHud.jsx';

describe('StatusHud', () => {
  afterEach(() => cleanup());
  it('renders the model name and percentages from lastStatus', () => {
    render(
      <StatusHud
        lastStatus={{
          model: 'Sonnet 5',
          contextPct: 42,
          fiveHourPct: 62,
          fiveHourResetsAt: null,
          sevenDayPct: 31,
          sevenDayResetsAt: null,
        }}
      />
    );
    expect(screen.getByText('Sonnet 5')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByText('31%')).toBeTruthy();
  });

  it('renders a placeholder before any status_update has arrived', () => {
    render(<StatusHud lastStatus={null} />);
    expect(screen.getByTestId('status-hud')).toBeTruthy();
  });
});
