import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MilestoneToast from '../src/hud/MilestoneToast.jsx';

describe('MilestoneToast', () => {
  afterEach(() => cleanup());

  it('announces a newly unlocked celestial body', () => {
    render(<MilestoneToast milestone={{ id: 'asteroids', minutes: 10, label: '小行星带' }} />);
    expect(screen.getByText('新天体出现')).toBeTruthy();
    expect(screen.getByText('小行星带')).toBeTruthy();
  });

  it('renders nothing without a milestone', () => {
    const { container } = render(<MilestoneToast milestone={null} />);
    expect(container.textContent).toBe('');
  });
});
