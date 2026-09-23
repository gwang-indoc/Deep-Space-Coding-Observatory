import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import StepList from '../src/hud/StepList.jsx';

describe('StepList', () => {
  afterEach(() => cleanup());

  it('renders all four step labels', () => {
    render(<StepList activeStep={null} recentLog={[]} />);
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('Reading')).toBeTruthy();
    expect(screen.getByText('Editing')).toBeTruthy();
    expect(screen.getByText('Testing')).toBeTruthy();
  });

  it('marks the active step with data-active', () => {
    render(<StepList activeStep="reading" recentLog={[]} />);
    expect(screen.getByText('Reading').closest('[data-active]').getAttribute('data-active')).toBe('true');
    expect(screen.getByText('Editing').closest('[data-active]').getAttribute('data-active')).toBe('false');
  });

  it('hides the recent log by default and shows it on hover', () => {
    render(<StepList activeStep="reading" recentLog={['Reading src/auth/session.ts']} />);
    expect(screen.queryByText('Reading src/auth/session.ts')).toBeNull();

    fireEvent.mouseEnter(screen.getByTestId('step-list'));
    expect(screen.getByText('Reading src/auth/session.ts')).toBeTruthy();

    fireEvent.mouseLeave(screen.getByTestId('step-list'));
    expect(screen.queryByText('Reading src/auth/session.ts')).toBeNull();
  });
});
