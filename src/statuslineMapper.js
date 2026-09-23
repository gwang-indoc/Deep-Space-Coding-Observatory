export function mapStatuslineEvent(raw) {
  return {
    type: 'status_update',
    ts: Date.now(),
    payload: {
      model: raw?.model?.display_name ?? 'unknown',
      contextPct: Math.round(raw?.context_window?.used_percentage ?? 0),
      fiveHourPct: Math.round(raw?.rate_limits?.five_hour?.used_percentage ?? 0),
      fiveHourResetsAt: raw?.rate_limits?.five_hour?.resets_at ?? null,
      sevenDayPct: Math.round(raw?.rate_limits?.seven_day?.used_percentage ?? 0),
      sevenDayResetsAt: raw?.rate_limits?.seven_day?.resets_at ?? null,
    },
  };
}
