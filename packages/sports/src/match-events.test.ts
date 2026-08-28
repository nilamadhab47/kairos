/**
 * Parser fixtures for ESPN soccer summaries and UEFA playerEvents.
 *
 *   pnpm --filter @kairo/sports exec tsx src/match-events.test.ts
 */

import { strict as assert } from 'node:assert';
import { parseEspnSoccerSummary } from './providers/espn.js';
import { parseUefaPlayerEvents } from './providers/uefa.js';

const espnSummary = {
  header: {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', id: '359', team: { id: '359' } },
          { homeAway: 'away', id: '388', team: { id: '388' } },
        ],
        details: [
          {
            clock: { value: 874, displayValue: "15'" },
            scoringPlay: true,
            team: { id: '359' },
            participants: [{ athlete: { displayName: 'Kai Havertz' } }],
            text: 'Goal! Arsenal 1, Coventry City 0.',
          },
        ],
      },
    ],
  },
  keyEvents: [
    {
      type: { id: '80', text: 'Kickoff', type: 'kickoff' },
      text: 'First Half begins.',
      clock: { value: 0, displayValue: '' },
      team: '359',
    },
    {
      type: { id: '70', text: 'Goal', type: 'goal' },
      text: 'Goal! Arsenal 1, Coventry City 0. Kai Havertz (Arsenal).',
      clock: { value: 874, displayValue: "15'" },
      scoringPlay: true,
      team: '359',
      participants: [{ athlete: { displayName: 'Kai Havertz' } }],
    },
    {
      type: { id: '94', text: 'Yellow Card', type: 'yellow-card' },
      text: 'Caleb Yirenkyi (Coventry City) is shown the yellow card.',
      clock: { value: 1584, displayValue: "27'" },
      team: '388',
      participants: [{ athlete: { displayName: 'Caleb Yirenkyi' } }],
    },
    {
      type: { id: '76', text: 'Substitution', type: 'substitution' },
      text: 'Substitution, Arsenal. Martín Zubimendi replaces Declan Rice.',
      clock: { value: 4035, displayValue: "68'" },
      team: '359',
      participants: [
        { athlete: { displayName: 'Martín Zubimendi' } },
        { athlete: { displayName: 'Declan Rice' } },
      ],
    },
  ],
};

const espn = parseEspnSoccerSummary(espnSummary, 'espn:401879301');
assert.equal(espn.length, 3, 'kickoff is skipped; goal/card/sub kept');
assert.equal(espn[0]?.type, 'goal');
assert.equal(espn[0]?.minute, 15);
assert.equal(espn[0]?.team, 'home');
assert.equal(espn[0]?.playerName, 'Kai Havertz');
assert.equal(espn[1]?.type, 'card');
assert.equal(espn[1]?.team, 'away');
assert.equal(espn[1]?.playerName, 'Caleb Yirenkyi');
assert.equal(espn[2]?.type, 'substitution');
assert.equal(espn[2]?.minute, 68);
console.log('ok   parseEspnSoccerSummary');

const uefaMatch = {
  homeTeam: { id: '2609356' },
  awayTeam: { id: '60457' },
  playerEvents: {
    scorers: [
      {
        goalType: 'SCORED',
        teamId: '2609356',
        time: { minute: 66, second: 52 },
        player: { internationalName: 'Veljko Simić' },
      },
      {
        goalType: 'PENALTY',
        teamId: '60457',
        time: { minute: 16 },
        player: { internationalName: 'Nano' },
      },
    ],
    redCards: [
      {
        teamId: '2609356',
        time: { minute: 90, injuryMinute: 2 },
        player: { internationalName: 'Steve Solvet' },
      },
    ],
    penaltiesMissed: [
      {
        teamId: '60457',
        time: { minute: 67 },
        player: { internationalName: 'Áki Samuelsen' },
      },
    ],
  },
};

const uefa = parseUefaPlayerEvents(uefaMatch, 'uefa:2048621');
assert.equal(uefa.length, 4);
const goal = uefa.find((e) => e.type === 'goal');
assert.equal(goal?.playerName, 'Veljko Simić');
assert.equal(goal?.team, 'home');
assert.equal(goal?.minute, 66);
const pen = uefa.find((e) => e.type === 'penalty' && e.detail === 'Penalty');
assert.equal(pen?.playerName, 'Nano');
assert.equal(pen?.team, 'away');
const red = uefa.find((e) => e.type === 'card');
assert.equal(red?.playerName, 'Steve Solvet');
assert.equal(red?.minute, 92);
assert.equal(red?.detail, 'Red card');
const missed = uefa.find((e) => e.detail === 'Missed penalty');
assert.equal(missed?.playerName, 'Áki Samuelsen');
console.log('ok   parseUefaPlayerEvents');

console.log('\n2 passed');
