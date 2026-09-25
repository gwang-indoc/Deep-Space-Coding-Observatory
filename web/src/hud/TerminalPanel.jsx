import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { groupToolResults } from '../state/transcript.js';

export const CLOSE_DELAY_MS = 300;
// Within this distance of the bottom counts as "at the latest output".
const FOLLOW_THRESHOLD_PX = 24;

function diffRowClass(sign) {
  if (sign === '+') return 'add';
  if (sign === '-') return 'del';
  return 'ctx';
}

function Entry({ entry }) {
  switch (entry.kind) {
    case 'prompt':
      return (
        <div className="term-entry term-entry--prompt">
          <span className="term-marker">❯</span>
          {entry.text}
        </div>
      );
    case 'text':
      return (
        <div className="term-entry term-entry--text">
          <span className="term-marker">●</span>
          {entry.text}
        </div>
      );
    case 'tool':
      return (
        <div className="term-entry term-entry--tool">
          <span className="term-marker">●</span>
          <strong>{entry.name}</strong>({entry.summary})
        </div>
      );
    case 'output':
      return (
        <div className={`term-entry term-entry--output${entry.isError ? ' term-entry--error' : ''}`}>
          {entry.lines.map((line, i) => (
            <div key={i} className="term-output-line">
              <span className="term-elbow">{i === 0 ? '⎿' : ''}</span>
              {line}
            </div>
          ))}
          {entry.more > 0 && (
            <div className="term-output-line term-more">
              <span className="term-elbow" />… +{entry.more} lines
            </div>
          )}
        </div>
      );
    case 'diff':
      return (
        <div className="term-entry term-entry--diff">
          {entry.rows.map((row, i) => (
            <div key={i} className={`term-diff-row term-diff-row--${diffRowClass(row.sign)}`}>
              <span className="term-diff-lineno">{row.lineNo}</span>
              <span className="term-diff-sign">{row.sign}</span>
              {row.text}
            </div>
          ))}
          {entry.more > 0 && <div className="term-output-line term-more">… +{entry.more} lines</div>}
        </div>
      );
    case 'notice':
      return (
        <div className="term-entry term-entry--notice">
          <span className="term-marker">●</span>
          {entry.text}
        </div>
      );
    case 'separator':
      return <div className="term-entry term-entry--separator">{entry.text}</div>;
    default:
      return null;
  }
}

// A read-only replay of the session transcript that slides up from the bottom
// edge while the pointer is over it.
export default function TerminalPanel({ entries }) {
  const [open, setOpen] = useState(false);
  const [following, setFollowing] = useState(true);
  const closeTimer = useRef(null);
  const bodyRef = useRef(null);
  const ordered = useMemo(() => groupToolResults(entries), [entries]);

  function cancelClose() {
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }
  function show() {
    cancelClose();
    setOpen(true);
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }
  useEffect(() => cancelClose, []);

  function scrollToBottom() {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }
  useLayoutEffect(() => {
    if (following) scrollToBottom();
  }, [entries, open, following]);

  function onScroll() {
    const el = bodyRef.current;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX);
  }
  function jumpToLatest() {
    setFollowing(true);
    scrollToBottom();
  }

  return (
    <>
      <div className="terminal-trigger" data-testid="terminal-trigger" onMouseEnter={show} onMouseLeave={scheduleClose}>
        {!open && <span className="terminal-trigger__hint">▲ terminal</span>}
      </div>
      <div
        className={`terminal-panel${open ? ' terminal-panel--open' : ''}`}
        data-testid="terminal-panel"
        data-open={open}
        aria-hidden={!open}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
      >
        <div className="terminal-panel__body" data-testid="terminal-panel-body" ref={bodyRef} onScroll={onScroll}>
          {entries.length === 0 ? (
            <div className="terminal-panel__empty">等待 Claude Code 输出…</div>
          ) : (
            ordered.map((entry) => <Entry key={entry.id} entry={entry} />)
          )}
        </div>
        {open && !following && (
          <button type="button" className="terminal-panel__jump" onClick={jumpToLatest}>
            ↓ 最新
          </button>
        )}
      </div>
    </>
  );
}
