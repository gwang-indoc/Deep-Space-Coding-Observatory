import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import TerminalPanel, { CLOSE_DELAY_MS } from '../src/hud/TerminalPanel.jsx';

const ENTRIES = [
  { id: '1', kind: 'prompt', text: 'how is it going?' },
  { id: '2', kind: 'text', text: 'Group 1 is complete.' },
  { id: '3', kind: 'tool', name: 'Bash', summary: 'npm test' },
  { id: '4', kind: 'output', toolUseId: 't', lines: ['ok 1', 'ok 2'], more: 3, isError: false },
  { id: '5', kind: 'output', toolUseId: 'u', lines: ['Exit code 1'], more: 0, isError: true },
  {
    id: '6',
    kind: 'diff',
    toolUseId: 'v',
    file: 'tasks.md',
    rows: [
      { sign: '-', lineNo: 5, text: '- [ ] 1.1' },
      { sign: '+', lineNo: 5, text: '- [x] 1.1' },
      { sign: ' ', lineNo: 6, text: 'context' },
    ],
    more: 0,
  },
  { id: '7', kind: 'notice', text: 'Agent "Review" finished' },
  { id: '8', kind: 'separator', text: 'new session' },
  { id: '9', kind: 'mystery', text: 'should not render' },
];

describe('TerminalPanel', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is closed by default and shows the hint', () => {
    render(<TerminalPanel entries={[]} />);
    expect(screen.getByTestId('terminal-panel').getAttribute('data-open')).toBe('false');
    expect(screen.getByText('▲ terminal')).toBeTruthy();
  });

  it('opens when the pointer enters the bottom strip', () => {
    render(<TerminalPanel entries={[]} />);
    fireEvent.mouseEnter(screen.getByTestId('terminal-trigger'));
    expect(screen.getByTestId('terminal-panel').getAttribute('data-open')).toBe('true');
    expect(screen.queryByText('▲ terminal')).toBeNull();
  });

  it('closes 300 ms after the pointer leaves, and re-entering cancels the close', () => {
    vi.useFakeTimers();
    render(<TerminalPanel entries={[]} />);
    const panel = screen.getByTestId('terminal-panel');
    fireEvent.mouseEnter(screen.getByTestId('terminal-trigger'));
    fireEvent.mouseLeave(panel);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS - 50));
    expect(panel.getAttribute('data-open')).toBe('true');
    fireEvent.mouseEnter(panel);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS));
    expect(panel.getAttribute('data-open')).toBe('true');
    fireEvent.mouseLeave(panel);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS));
    expect(panel.getAttribute('data-open')).toBe('false');
  });

  it('shows the empty state before any output', () => {
    render(<TerminalPanel entries={[]} />);
    expect(screen.getByText('等待 Claude Code 输出…')).toBeTruthy();
  });

  it('renders each entry kind in its Claude Code style', () => {
    const { container } = render(<TerminalPanel entries={ENTRIES} />);
    expect(container.querySelector('.term-entry--prompt').textContent).toBe('❯how is it going?');
    expect(container.querySelector('.term-entry--text').textContent).toBe('●Group 1 is complete.');
    const tool = container.querySelector('.term-entry--tool');
    expect(tool.querySelector('strong').textContent).toBe('Bash');
    expect(tool.textContent).toBe('●Bash(npm test)');
    const [ok, err] = container.querySelectorAll('.term-entry--output');
    expect(ok.textContent).toContain('⎿ok 1');
    expect(ok.textContent).toContain('… +3 lines');
    expect(ok.classList.contains('term-entry--error')).toBe(false);
    expect(err.classList.contains('term-entry--error')).toBe(true);
    expect(container.querySelector('.term-diff-row--del').textContent).toBe('5-- [ ] 1.1');
    expect(container.querySelector('.term-diff-row--add').textContent).toBe('5+- [x] 1.1');
    expect(container.querySelector('.term-diff-row--ctx')).toBeTruthy();
    expect(container.querySelector('.term-entry--notice').textContent).toBe('●Agent "Review" finished');
    expect(container.querySelector('.term-entry--separator').textContent).toBe('new session');
    expect(screen.queryByText('should not render')).toBeNull();
  });

  it('stops following when scrolled up and offers a jump back to the latest', () => {
    render(<TerminalPanel entries={ENTRIES} />);
    const body = screen.getByTestId('terminal-panel-body');
    Object.defineProperty(body, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(body, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(body, 'scrollTop', { value: 100, writable: true, configurable: true });
    fireEvent.scroll(body);
    const jump = screen.getByText('↓ 最新');
    fireEvent.click(jump);
    expect(body.scrollTop).toBe(1000);
    expect(screen.queryByText('↓ 最新')).toBeNull();
  });
});

describe('TerminalPanel ordering', () => {
  afterEach(() => cleanup());

  it('renders a parallel call\'s result under its own call', () => {
    const { container } = render(
      <TerminalPanel
        entries={[
          { id: '1', kind: 'tool', toolUseId: 'a', name: 'Edit', summary: 'x.js' },
          { id: '2', kind: 'tool', toolUseId: 'b', name: 'Bash', summary: 'ls' },
          { id: '3', kind: 'output', toolUseId: 'a', lines: ['edited'], more: 0, isError: false },
          { id: '4', kind: 'output', toolUseId: 'b', lines: ['listing'], more: 0, isError: false },
        ]}
      />
    );
    const texts = [...container.querySelectorAll('.term-entry')].map((el) => el.textContent);
    expect(texts).toEqual(['●Edit(x.js)', '⎿edited', '●Bash(ls)', '⎿listing']);
  });
});
