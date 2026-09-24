// Scenery unlocked by how long Claude has been actively working this session.
// Once unlocked a body stays for the rest of the session.
export const MILESTONES = [
  { id: 'cluster', minutes: 5, label: '疏散星团' },
  { id: 'asteroids', minutes: 10, label: '小行星带' },
  { id: 'giant', minutes: 20, label: '远方巨行星' },
  { id: 'galaxy', minutes: 40, label: '旋涡星系' },
  { id: 'pulsar', minutes: 60, label: '脉冲星' },
  { id: 'blackhole', minutes: 90, label: '黑洞' },
  { id: 'remnant', minutes: 120, label: '超新星遗迹' },
];

const MINUTE_MS = 60 * 1000;

export function unlockedMilestones(activeMs) {
  return MILESTONES.filter((m) => activeMs >= m.minutes * MINUTE_MS);
}

export function nextMilestone(activeMs) {
  const milestone = MILESTONES.find((m) => activeMs < m.minutes * MINUTE_MS);
  return milestone ? { milestone, remainingMs: milestone.minutes * MINUTE_MS - activeMs } : null;
}
