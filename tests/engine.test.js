import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, command, roundQuestions, projectDisplay, missingGrades, standings } from '../src/engine.js';
import { DemoStore } from '../src/demo-store.js';
const act = (s, type, values = {}) => command(s, { type, ...values });
function configured(bonus = true) {
  return act(newGame(), 'configure', { title: 'Practice', names: ['A', 'B', 'C'], categories: ['General', 'Science'], bonus });
}
function grading() {
  let s = act(act(configured(), 'launch'), 'ask');
  while (s.question < roundQuestions(s).length - 1) s = act(s, 'nextQuestion');
  return act(act(s, 'collect'), 'grade');
}
function markAll(s) {
  for (const [i, t] of s.teams.entries()) for (const q of roundQuestions(s)) s = act(s, 'mark', { team: t.id, question: q.id, points: i === 0 ? q.points : i === 1 ? q.points / 2 : 0 });
  return s;
}
function approved() { return act(act(markAll(grading()), 'review'), 'approve'); }
function leaderboard() {
  let s = approved();
  for (const _ of roundQuestions(s)) s = act(s, 'reveal');
  return act(s, 'leaderboard');
}
test('projection has no answer or standings through grading and approval', () => {
  for (const s of [newGame(), configured(), grading(), markAll(grading()), approved()]) {
    const p = projectDisplay(s);
    assert.equal(p.answer, undefined); assert.equal(p.standings, undefined);
    assert.equal(p.grades, undefined); assert.equal(p.teams, undefined);
    assert.equal(p.questions, undefined);
  }
  const asking = act(act(configured(), 'launch'), 'ask');
  assert.deepEqual(Object.keys(projectDisplay(asking).question).sort(), ['bonus', 'number', 'points', 'prompt', 'total']);
});
test('incomplete grading and illegal skipping cannot be finalized', () => {
  assert.throws(() => act(grading(), 'review'), /Finish/);
  assert.throws(() => act(grading(), 'approve'), /unavailable/);
  assert.throws(() => act(approved(), 'leaderboard'), /every answer/);
  assert.throws(() => act(act(act(configured(), 'launch'), 'ask'), 'collect'), /every question/);
});
test('bonuses and half credit derive correct totals', () => {
  const s = markAll(grading());
  assert.deepEqual(standings(s).map(t => t.score), [4, 2, 0]);
  assert.equal(missingGrades(s).length, 0);
  assert.equal(roundQuestions(configured(false)).length, 2);
});
test('each answer reveals alone and correct teams appear only when requested', () => {
  const s = act(approved(), 'reveal');
  const p = projectDisplay(s);
  assert.equal(p.answer.answer, 'Six'); assert.equal(p.correctTeams, undefined); assert.equal(p.standings, undefined);
  assert.deepEqual(projectDisplay(act(s, 'toggleTeams')).correctTeams, ['A']);
  assert.deepEqual(s.revealed, ['q1']);
});
test('leaderboard is host-paced, bottom-up, and fully persisted', () => {
  let s = leaderboard();
  assert.deepEqual(projectDisplay(s).standings, []);
  s = act(s, 'revealRank');
  assert.equal(projectDisplay(s).standings[0].name, 'C');
  assert.throws(() => act(s, 'nextRound'), /full leaderboard/);
  s = act(s, 'allRanks');
  const recovered = JSON.parse(JSON.stringify(s));
  assert.deepEqual(projectDisplay(recovered), projectDisplay(s));
  assert.equal(act(s, 'nextRound').phase, 'ROUND_INTRO');
});
test('corrections invalidate approval without hiding a revealed answer or updating published scores', () => {
  let s = act(leaderboard(), 'allRanks'); const old = s.published[0].score;
  assert.throws(() => act(s, 'mark', { team: s.teams[0].id, question: 'q1', points: 0 }), /reason/);
  s = act(s, 'mark', { team: s.teams[0].id, question: 'q1', points: 0, reason: 'Rechecked sheet' });
  assert.ok(s.revealed.includes('q1')); assert.equal(s.published[0].score, old);
  assert.equal(standings(s)[0].score, old - 1);
  assert.throws(() => act(s, 'republish'), /Approve/);
  assert.throws(() => act(s, 'mark', { team: s.teams[0].id, question: 'q2', points: 0 }), /reason/);
  s = act(act(s, 'approve'), 'republish'); assert.equal(s.published[0].score, old - 1);
});
test('ties share ranks and reveal together', () => {
  let s = leaderboard();
  // Equalize team A to B using an audited adjustment, then explicitly republish.
  s = act(s, 'adjust', { team: s.teams[0].id, points: -2, reason: 'Tie test' });
  s = act(s, 'republish');
  assert.deepEqual(s.published.map(t => t.rank), [1, 1, 3]);
  assert.equal(s.leaderboardCount, 3);
});
test('complete two-round game preserves cumulative scores', () => {
  let s = act(act(leaderboard(), 'allRanks'), 'nextRound');
  s = act(s, 'ask');
  while (s.question < roundQuestions(s).length - 1) s = act(s, 'nextQuestion');
  s = act(act(s, 'collect'), 'grade'); s = act(act(markAll(s), 'review'), 'approve');
  for (const _ of roundQuestions(s)) s = act(s, 'reveal');
  s = act(act(act(s, 'leaderboard'), 'allRanks'), 'nextRound');
  assert.equal(s.phase, 'GAME_COMPLETE'); assert.deepEqual(s.published.map(t => t.score), [8, 4, 0]);
});
test('pause/reset timer never changes game phase or reveals answers', () => {
  let s = act(act(configured(), 'launch'), 'ask');
  s = act(s, 'pauseTimer'); assert.ok(s.timer.paused);
  s = act(s, 'resetTimer'); assert.equal(s.timer.elapsed, 0);
  assert.equal(s.phase, 'ASKING'); assert.equal(projectDisplay(s).answer, undefined);
});
test('storage failure cannot claim a save, and stale revisions are rejected', async () => {
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const adapter = new DemoStore(storage); await adapter.reset();
  const args = { type: 'configure', title: 'Demo', names: ['A', 'B'], categories: ['A', 'B'], bonus: false };
  const saved = await adapter.execute(args, 0); assert.equal(saved.revision, 1);
  await assert.rejects(() => adapter.execute(args, 0), /Another tab/);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(() => adapter.execute({ type: 'launch' }, 1), /Quota/);
  assert.equal((await adapter.load()).phase, 'READY');
});
