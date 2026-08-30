import assert from 'node:assert/strict';
import { effectiveMatchStatus, liveWindowMs } from './match-status.js';

const hour = 60 * 60_000;

assert.equal(effectiveMatchStatus('scheduled', Date.now() + hour, 'football'), 'scheduled');
assert.equal(effectiveMatchStatus('scheduled', Date.now() - 10 * 60_000, 'football'), 'live');
assert.equal(effectiveMatchStatus('live', Date.now() - 30 * 60_000, 'football'), 'live');
assert.equal(effectiveMatchStatus('live', Date.now() - 5 * hour, 'football'), 'completed');
assert.equal(effectiveMatchStatus('in', Date.now() - 20 * 60_000, 'football'), 'live');
assert.equal(effectiveMatchStatus('FT', Date.now() - 10 * 60_000, 'football'), 'completed');
assert.equal(effectiveMatchStatus('cancelled', Date.now() - hour), 'cancelled');
assert.ok(liveWindowMs('cricket') > liveWindowMs('football'));

console.log('match-status.test.ts ok');
