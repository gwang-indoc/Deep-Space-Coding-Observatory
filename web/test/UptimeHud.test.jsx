import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import UptimeHud from '../src/hud/UptimeHud.jsx';
import { MILESTONES } from '../src/state/milestones.js';

const MIN = 60 * 1000;

describe('UptimeHud', () => {
  afterEach(() => cleanup());

  it('shows running time and the countdown to the next celestial body', () => {
    render(<UptimeHud activeMs={3 * MIN} />);
    expect(screen.getByText('运行 3m')).toBeTruthy();
    expect(screen.getByText(`${MILESTONES[0].minutes - 3}m 后出现：${MILESTONES[0].label}`)).toBeTruthy();
  });

  it('formats hours once past sixty minutes', () => {
    render(<UptimeHud activeMs={(60 + 23) * MIN} />);
    expect(screen.getByText('运行 1h 23m')).toBeTruthy();
  });

  it('says everything is unlocked at the end', () => {
    render(<UptimeHud activeMs={(MILESTONES[MILESTONES.length - 1].minutes + 5) * MIN} />);
    expect(screen.getByText('所有天体已出现')).toBeTruthy();
  });
});
