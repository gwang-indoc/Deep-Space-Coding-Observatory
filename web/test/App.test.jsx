import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';

describe('App', () => {
  afterEach(() => cleanup());

  it('renders the orbit root element', () => {
    render(<App />);
    expect(screen.getByTestId('orbit-app')).toBeTruthy();
  });

  it('mounts the terminal panel with its bottom-edge trigger', () => {
    render(<App />);
    expect(screen.getByTestId('terminal-trigger')).toBeTruthy();
    expect(screen.getByTestId('terminal-panel').getAttribute('data-open')).toBe('false');
  });
});
