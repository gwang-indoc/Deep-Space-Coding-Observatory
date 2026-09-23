import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App.jsx';

describe('App', () => {
  it('renders the orbit root element', () => {
    render(<App />);
    expect(screen.getByTestId('orbit-app')).toBeTruthy();
  });
});
