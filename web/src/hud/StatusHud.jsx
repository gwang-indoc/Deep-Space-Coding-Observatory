import { contextTone, formatResetCountdown } from './hudFormat.js';

export default function StatusHud({ lastStatus }) {
  if (!lastStatus) {
    return <div className="status-hud status-hud--idle" data-testid="status-hud" />;
  }

  const { model, contextPct, fiveHourPct, fiveHourResetsAt, sevenDayPct, sevenDayResetsAt } = lastStatus;
  const now = Date.now();

  return (
    <div className={`status-hud status-hud--${contextTone(contextPct)}`} data-testid="status-hud">
      <div className="status-hud__model">{model}</div>
      <div className="status-hud__row">
        <span>Context</span>
        <span>{contextPct}%</span>
      </div>
      <div className="status-hud__row">
        <span>5h</span>
        <span>{fiveHourPct}%</span>
        <span>{formatResetCountdown(fiveHourResetsAt, now)}</span>
      </div>
      <div className="status-hud__row">
        <span>7d</span>
        <span>{sevenDayPct}%</span>
        <span>{formatResetCountdown(sevenDayResetsAt, now)}</span>
      </div>
    </div>
  );
}
