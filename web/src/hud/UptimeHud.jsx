import { nextMilestone } from '../state/milestones.js';

function formatMinutes(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function UptimeHud({ activeMs }) {
  const next = nextMilestone(activeMs);
  return (
    <div className="uptime-hud" data-testid="uptime-hud">
      <div className="uptime-hud__elapsed">运行 {formatMinutes(activeMs)}</div>
      <div className="uptime-hud__next">
        {next ? `${formatMinutes(next.remainingMs + 59999)} 后出现：${next.milestone.label}` : '所有天体已出现'}
      </div>
    </div>
  );
}
