// Pure domain logic. The local demo adapter supplies persistence; no DOM or storage here.
export const PHASES = ['DRAFT', 'READY', 'ROUND_INTRO', 'ASKING', 'COLLECTING', 'GRADING', 'GRADING_REVIEW', 'ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE'];
export const CATEGORIES = ['General knowledge', 'Science & nature'];
const samples = [
  [
    { id: 'q1', prompt: 'How many sides does a hexagon have?', answer: 'Six', note: 'Accept 6. A regular hexagon has six equal sides.', points: 1 },
    { id: 'q2', prompt: 'Which ocean is the largest on Earth?', answer: 'The Pacific Ocean', note: 'Accept Pacific.', points: 1 },
    { id: 'b1', prompt: 'How many minutes are in two and a half hours?', answer: '150 minutes', note: 'Bonus question. Worth two points.', points: 2, bonus: true },
  ],
  [
    { id: 'q3', prompt: 'What is the chemical symbol for gold?', answer: 'Au', note: 'Both letters are required for full credit.', points: 1 },
    { id: 'q4', prompt: 'Which planet is closest to the Sun?', answer: 'Mercury', note: 'Accept Mercury.', points: 1 },
    { id: 'b2', prompt: 'How many legs does an adult insect have?', answer: 'Six', note: 'Accept 6. Bonus question worth two points.', points: 2, bonus: true },
  ],
];

export function newGame() {
  return {
    version: 1, revision: 0, phase: 'DRAFT', title: 'Thursday night trivia',
    teams: [{ id: 'team-a', name: 'The Hoptimists' }, { id: 'team-b', name: 'Quiz on Tap' }, { id: 'team-c', name: 'The Regulars' }],
    rounds: samples.map((questions, i) => ({ id: `round-${i + 1}`, category: CATEGORIES[i], questions: structuredClone(questions) })),
    round: 0, question: 0, team: 0, reveal: -1, revealTeams: false,
    grades: {}, approved: [], everApproved: [], revealed: [], published: [], leaderboardCount: 0,
    adjustments: [], events: [], bonus: true,
    timer: { start: null, elapsed: 0, paused: true },
  };
}

export const roundQuestions = (s) => s.rounds[s.round].questions.filter(q => s.bonus || !q.bonus);
export const gradeKey = (team, question) => `${team}:${question}`;
export function missingGrades(s) {
  return s.teams.flatMap(t => roundQuestions(s).filter(q => s.grades[gradeKey(t.id, q.id)] === undefined).map(q => ({ team: t.id, question: q.id })));
}
export function teamSubtotal(s, teamId) {
  return roundQuestions(s).reduce((total, q) => total + (s.grades[gradeKey(teamId, q.id)] ?? 0), 0);
}
export function standings(s) {
  const qs = s.rounds.slice(0, s.round + 1).flatMap(r => r.questions.filter(q => s.bonus || !q.bonus));
  const rows = s.teams.map(t => ({ id: t.id, name: t.name,
    score: qs.reduce((n, q) => n + (s.grades[gradeKey(t.id, q.id)] ?? 0), 0) + s.adjustments.filter(a => a.team === t.id).reduce((n, a) => n + a.points, 0),
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows.map((t, i) => ({ ...t, rank: i && t.score === rows[i - 1].score ? rows.findIndex(x => x.score === t.score) + 1 : i + 1 }));
}

function requireThat(condition, message) { if (!condition) throw new Error(message); }
function phase(s, ...allowed) { requireThat(allowed.includes(s.phase), 'That control is unavailable in this phase.'); }

export function command(original, action) {
  const s = structuredClone(original);
  const qs = roundQuestions(s);
  switch (action.type) {
    case 'configure':
      phase(s, 'DRAFT');
      requireThat(action.title.trim().length > 0 && action.title.length <= 80, 'Give the game a name (up to 80 characters).');
      requireThat(action.names.length >= 2 && action.names.length <= 8 && action.names.every(n => n.trim() && n.length <= 40), 'Add 2–8 team names, each up to 40 characters.');
      requireThat(new Set(action.names.map(n => n.trim().toLowerCase())).size === action.names.length, 'Team names must be unique.');
      requireThat(action.categories.length === 2 && action.categories.every(c => c.trim() && c.length <= 50), 'Give both rounds a category (up to 50 characters).');
      s.title = action.title.trim(); s.bonus = action.bonus;
      s.teams = action.names.map((name, i) => ({ id: `team-${i}`, name: name.trim() }));
      s.rounds.forEach((r, i) => r.category = action.categories[i].trim());
      if (action.questions) {
        requireThat(action.questions.length === 6 && action.questions.every(q => q.prompt.trim() && q.answer.trim() && q.prompt.length <= 400 && q.answer.length <= 200), 'Every question needs a prompt and answer.');
        s.rounds.flatMap(r => r.questions).forEach((q, i) => { q.prompt = action.questions[i].prompt.trim(); q.answer = action.questions[i].answer.trim(); q.note = 'Custom practice question.'; });
      }
      s.phase = 'READY'; break;
    case 'edit': phase(s, 'READY'); s.phase = 'DRAFT'; break;
    case 'launch': phase(s, 'READY'); s.phase = 'ROUND_INTRO'; break;
    case 'ask': phase(s, 'ROUND_INTRO'); s.phase = 'ASKING'; s.question = 0; s.timer = { start: Date.now(), elapsed: 0, paused: false }; break;
    case 'nextQuestion':
      phase(s, 'ASKING'); requireThat(s.question < qs.length - 1, 'All questions have been shown.'); s.question++; s.timer = { start: Date.now(), elapsed: 0, paused: false }; break;
    case 'pauseTimer':
      phase(s, 'ASKING');
      if (s.timer.paused) { s.timer.start = Date.now(); s.timer.paused = false; }
      else { s.timer.elapsed += Math.max(0, Date.now() - s.timer.start); s.timer.paused = true; s.timer.start = null; }
      break;
    case 'resetTimer': phase(s, 'ASKING'); s.timer = { start: Date.now(), elapsed: 0, paused: false }; break;
    case 'collect':
      phase(s, 'ASKING'); requireThat(s.question === qs.length - 1, 'Show every question before collecting sheets.'); s.phase = 'COLLECTING'; break;
    case 'grade': phase(s, 'COLLECTING'); s.phase = 'GRADING'; s.team = 0; break;
    case 'selectTeam':
      phase(s, 'GRADING', 'GRADING_REVIEW', 'ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE');
      requireThat(Number.isInteger(action.index) && action.index >= 0 && action.index < s.teams.length, 'Unknown team.'); s.team = action.index; break;
    case 'mark': {
      phase(s, 'GRADING', 'GRADING_REVIEW', 'ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE');
      const q = qs.find(q => q.id === action.question);
      requireThat(q && s.teams.some(t => t.id === action.team), 'Unknown team or question.');
      requireThat([0, q.points / 2, q.points].includes(action.points), 'Choose incorrect, half credit, or correct.');
      const key = gradeKey(action.team, q.id);
      if (s.grades[key] === action.points) return original;
      action = { ...action, previousPoints: s.grades[key] ?? null };
      if ((s.everApproved || s.approved).includes(s.round)) {
        requireThat(action.reason?.trim(), 'Add a reason for correcting an approved grade.');
        s.approved = s.approved.filter(r => r !== s.round);
      }
      s.grades[key] = action.points;
      break;
    }
    case 'review': phase(s, 'GRADING'); requireThat(missingGrades(s).length === 0, 'Finish every team’s sheet before review.'); s.phase = 'GRADING_REVIEW'; break;
    case 'approve':
      phase(s, 'GRADING_REVIEW', 'ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE');
      requireThat(!missingGrades(s).length, 'Finish every team’s sheet before approval.');
      if (!s.approved.includes(s.round)) s.approved.push(s.round);
      s.everApproved ||= [];
      if (!s.everApproved.includes(s.round)) s.everApproved.push(s.round);
      if (s.phase === 'GRADING_REVIEW') { s.phase = 'ANSWER_REVEAL'; s.reveal = -1; }
      break;
    case 'reveal':
      phase(s, 'ANSWER_REVEAL'); requireThat(s.approved.includes(s.round), 'Approve the corrected grading before continuing.');
      requireThat(s.reveal < qs.length - 1, 'All answers have been revealed.'); s.reveal++; s.revealTeams = false;
      if (!s.revealed.includes(qs[s.reveal].id)) s.revealed.push(qs[s.reveal].id);
      break;
    case 'toggleTeams': phase(s, 'ANSWER_REVEAL'); requireThat(s.reveal >= 0, 'Reveal an answer first.'); s.revealTeams = !s.revealTeams; break;
    case 'leaderboard':
      phase(s, 'ANSWER_REVEAL'); requireThat(s.approved.includes(s.round), 'Approve the corrected grading first.');
      requireThat(s.reveal === qs.length - 1, 'Reveal every answer before publishing scores.');
      s.phase = 'LEADERBOARD_REVEAL'; s.published = standings(s); s.leaderboardCount = 0; break;
    case 'revealRank':
      phase(s, 'LEADERBOARD_REVEAL');
      requireThat(s.leaderboardCount < s.published.length, 'The full leaderboard is already visible.');
      { const next = s.published[s.published.length - s.leaderboardCount - 1];
        s.leaderboardCount += s.published.filter(t => t.rank === next.rank).length; }
      break;
    case 'allRanks': phase(s, 'LEADERBOARD_REVEAL'); s.leaderboardCount = s.published.length; break;
    case 'republish':
      phase(s, 'LEADERBOARD_REVEAL', 'GAME_COMPLETE'); requireThat(s.approved.includes(s.round), 'Approve corrected grades first.');
      s.published = standings(s); s.leaderboardCount = s.published.length; break;
    case 'nextRound':
      phase(s, 'LEADERBOARD_REVEAL'); requireThat(s.leaderboardCount === s.teams.length, 'Show the full leaderboard before continuing.');
      requireThat(s.approved.includes(s.round), 'Approve corrected grades before continuing.');
      if (s.round === s.rounds.length - 1) s.phase = 'GAME_COMPLETE';
      else { s.round++; s.phase = 'ROUND_INTRO'; s.question = 0; s.team = 0; s.reveal = -1; s.revealTeams = false; }
      break;
    case 'adjust':
      phase(s, 'GRADING', 'GRADING_REVIEW', 'ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE');
      requireThat(s.teams.some(t => t.id === action.team), 'Unknown team.');
      requireThat(Number.isFinite(action.points) && Math.abs(action.points) <= 100 && Number.isInteger(action.points * 2), 'Use a half-point increment between -100 and 100.');
      requireThat(action.reason?.trim(), 'Score adjustments need a reason.');
      s.adjustments.push({ team: action.team, points: action.points, reason: action.reason.trim(), time: new Date().toISOString() }); break;
    default: throw new Error('Unknown command.');
  }
  s.revision++;
  s.events.push({ type: action.type, revision: s.revision, time: new Date().toISOString(), detail: structuredClone(action) });
  return s;
}

// Only this projection is rendered by the TV. In production it must be generated server-side.
export function projectDisplay(s) {
  const result = { title: s.title, phase: s.phase, round: s.round + 1, category: s.rounds[s.round].category, revision: s.revision };
  const qs = roundQuestions(s);
  if (s.phase === 'ASKING') {
    const q = qs[s.question]; result.question = { prompt: q.prompt, number: s.question + 1, total: qs.length, points: q.points, bonus: Boolean(q.bonus) };
  }
  if (s.phase === 'ANSWER_REVEAL' && s.reveal >= 0) {
    const q = qs[s.reveal];
    result.answer = { prompt: q.prompt, answer: q.answer, number: s.reveal + 1, total: qs.length };
    if (s.revealTeams) result.correctTeams = s.teams.filter(t => s.grades[gradeKey(t.id, q.id)] === q.points).map(t => t.name);
  }
  if (s.phase === 'LEADERBOARD_REVEAL') result.standings = s.published.slice(s.published.length - s.leaderboardCount);
  if (s.phase === 'GAME_COMPLETE') result.standings = s.published;
  return result;
}
