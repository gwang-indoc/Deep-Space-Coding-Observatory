// test/statuslineMapper.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapStatuslineEvent } from '../src/statuslineMapper.js';

test('maps a full statusline payload to status_update', () => {
  const event = mapStatuslineEvent({
    model: { id: 'claude-sonnet-5', display_name: 'Sonnet 5' },
    context_window: { used_percentage: 42.4 },
    rate_limits: {
      five_hour: { used_percentage: 61.9, resets_at: 1758560000 },
      seven_day: { used_percentage: 31.2, resets_at: 1758990000 },
    },
  });

  assert.equal(event.type, 'status_update');
  assert.deepEqual(event.payload, {
    model: 'Sonnet 5',
    contextPct: 42,
    fiveHourPct: 62,
    fiveHourResetsAt: 1758560000,
    sevenDayPct: 31,
    sevenDayResetsAt: 1758990000,
  });
});

test('defaults missing fields instead of throwing', () => {
  const event = mapStatuslineEvent({});
  assert.deepEqual(event.payload, {
    model: 'unknown',
    contextPct: 0,
    fiveHourPct: 0,
    fiveHourResetsAt: null,
    sevenDayPct: 0,
    sevenDayResetsAt: null,
  });
});
