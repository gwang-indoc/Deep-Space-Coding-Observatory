import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ModeBanner from '../src/hud/ModeBanner.jsx';

describe('ModeBanner', () => {
  afterEach(() => cleanup());

  it('renders nothing while a mission is active', () => {
    const { container } = render(<ModeBanner mode="active" message={null} />);
    expect(container.textContent).toBe('');
  });

  it('shows a prominent awaiting-input banner with the Claude message', () => {
    render(<ModeBanner mode="waiting" message="Claude needs your permission to use Bash" />);
    expect(screen.getByText('AWAITING INPUT')).toBeTruthy();
    expect(screen.getByText('Claude needs your permission to use Bash')).toBeTruthy();
    expect(screen.getByTestId('mode-banner').dataset.mode).toBe('waiting');
  });

  it('shows a quieter idle banner', () => {
    render(<ModeBanner mode="idle" message={null} />);
    expect(screen.getByText('IDLE')).toBeTruthy();
    expect(screen.getByTestId('mode-banner').dataset.mode).toBe('idle');
  });
});
