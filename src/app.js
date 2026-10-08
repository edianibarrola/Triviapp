import { newGame, roundQuestions, gradeKey, missingGrades, teamSubtotal, standings, projectDisplay } from './engine.js';
import { DemoStore, subscribe } from './demo-store.js';
import { PRESETS, safePalette, processLogo } from './palette.js';
import { loadAppearance, saveAppearance, defaultAppearance, APPEARANCE_KEY } from './appearance-store.js';

const app = document.querySelector('#app');
const store = new DemoStore();
let state, appearance, draftAppearance, suggestion = null, message = '', error = '', busy = false;
let showCorrections = false, resetConfirm = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const route = () => location.hash.slice(1) || 'host';
const button = (label, action, style = '', disabled = false) => `<button type="button" class="${style}" data-action="${action}" ${disabled || busy ? 'disabled' : ''}>${label}</button>`;
const label = (text, content) => `<label>${text}${content}</label>`;
const input = (name, value, max = 80) => `<input name="${name}" value="${esc(value)}" maxlength="${max}" required>`;
const statusLabels = { DRAFT: 'Set up your game', READY: 'Ready to launch', ROUND_INTRO: 'Round introduction', ASKING: 'Questions on TV', COLLECTING: 'Collect answer sheets', GRADING: 'Private grading', GRADING_REVIEW: 'Review grading', ANSWER_REVEAL: 'Reveal answers', LEADERBOARD_REVEAL: 'Reveal standings', GAME_COMPLETE: 'Game complete' };

function applyTheme(a) {
  const p = safePalette(a.palette);
  for (const [key, value] of Object.entries({ '--accent': p.accent, '--bg': p.background, '--text': p.text, '--button-text': p.buttonText })) document.documentElement.style.setProperty(key, value);
}
function venueBrand(a, size = '') {
  return a.logo ? `<img class="venue-logo ${size}" src="${esc(a.logo)}" alt="${esc(a.venue)} logo">` : `<span class="venue-name ${size}">${esc(a.venue)}</span>`;
}
function timerMillis() {
  const t = state.timer || { elapsed: 0, paused: true };
  return (t.elapsed || 0) + (!t.paused && t.start ? Math.max(0, Date.now() - t.start) : 0);
}
function timerText(a = appearance) {
  const elapsed = Math.floor(timerMillis() / 1000);
  const seconds = a.timerMode === 'countdown' ? Math.max(0, a.countdown - elapsed) : elapsed;
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function tvSlide(projection, a = appearance, preview = false) {
  const p = projection;
  let content;
  if (p.question) content = `<div class="tv-kicker">${p.question.bonus ? 'BONUS QUESTION' : `QUESTION ${p.question.number} OF ${p.question.total}`}</div><h2>${esc(p.question.prompt)}</h2><div class="tv-points">${p.question.points} ${p.question.points === 1 ? 'POINT' : 'POINTS'}</div>`;
  else if (p.answer) content = `<div class="tv-kicker">ANSWER ${p.answer.number} OF ${p.answer.total}</div><p class="tv-original">${esc(p.answer.prompt)}</p><h2 class="answer">${esc(p.answer.answer)}</h2>${p.correctTeams ? `<p class="correct-teams">${p.correctTeams.length ? p.correctTeams.map(esc).join(' · ') : 'No teams earned full credit'}</p>` : ''}`;
  else if (p.standings) {
    const winners = p.phase === 'GAME_COMPLETE' ? p.standings.filter(t => t.rank === 1) : [];
    content = `<div class="tv-kicker">${p.phase === 'GAME_COMPLETE' ? 'FINAL RESULTS' : 'ROUND STANDINGS'}</div><h2 class="leader-title">${winners.length > 1 ? 'A tie at the top' : p.phase === 'GAME_COMPLETE' ? 'Our winner' : 'The standings'}</h2><div class="tv-ranks">${p.standings.length ? p.standings.map(t => `<div class="tv-rank ${t.rank === 1 ? 'first' : ''}"><span>${t.rank}</span><strong>${esc(t.name)}</strong><b>${t.score}</b></div>`).join('') : '<p>The suspense is brewing…</p>'}</div>`;
  } else {
    const titles = { DRAFT: 'Trivia night', READY: 'Trivia night', ROUND_INTRO: `Round ${p.round}`, COLLECTING: 'Pens down', GRADING: 'Grab a drink.<br>We’ll be right back.', GRADING_REVIEW: 'The scores are coming in.', ANSWER_REVEAL: 'Ready for the answers?' };
    const subtitles = { DRAFT: 'Get your team together.', READY: 'Get your team together.', ROUND_INTRO: p.category, COLLECTING: 'Hand your answer sheets to the host.', GRADING: 'Your host is grading this round.', GRADING_REVIEW: 'Answers coming up next.', ANSWER_REVEAL: 'Let’s see how you did.' };
    content = `<div class="tv-kicker">${p.phase === 'ROUND_INTRO' ? 'LET’S PLAY' : 'TRIVIA NIGHT'}</div><h2>${titles[p.phase] || 'Trivia night'}</h2><p class="tv-sub">${esc(subtitles[p.phase] || '')}</p>`;
  }
  return `<section class="tv-slide ${preview ? 'preview' : 'fullscreen-slide'}" aria-label="Audience presentation"><div class="tv-top">${venueBrand(a)}<span>ROUND ${p.round} · ${esc(p.category)}</span></div><div class="tv-body">${content}</div><div class="tv-bottom"><span>${p.phase === 'ASKING' && a.showTimer ? `<span data-timer>${timerText(a)}</span> <small>${a.timerMode === 'elapsed' ? 'ELAPSED' : 'REMAINING'}</small>` : 'PAPER ANSWERS · GOOD COMPANY'}</span><span>Powered by <b>triviapp</b></span></div></section>`;
}

function navigation() {
  return `<nav aria-label="Main navigation">${[['host', '◈', 'Host'], ['teams', '♧', 'Teams'], ['setup', '⚙', 'Setup']].map(([id, icon, title]) => `<a href="#${id}" ${route() === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${title}</a>`).join('')}</nav>`;
}

function host() {
  const qs = roundQuestions(state);
  let controls = '', privateContent = '';
  const count = missingGrades(state).length;
  switch (state.phase) {
    case 'DRAFT': controls = `<p>Start with two sample rounds and three teams. You can edit every question before launch.</p><a class="button primary" href="#setup">Set up practice game →</a>`; break;
    case 'READY': controls = button('Launch game →', 'launch', 'primary') + button('Edit game', 'edit'); break;
    case 'ROUND_INTRO': controls = button('Show first question →', 'ask', 'primary'); break;
    case 'ASKING': {
      const q = qs[state.question];
      controls = state.question < qs.length - 1 ? button('Show next question →', 'nextQuestion', 'primary') : button('Collect answer sheets →', 'collect', 'primary');
      privateContent = `<section class="timer-card"><div><span class="eyebrow">QUESTION ${appearance.timerMode === 'elapsed' ? 'ELAPSED' : 'REMAINING'}</span><strong data-timer>${timerText()}</strong><span class="muted" data-timer-status>${state.timer.paused ? 'Paused' : 'Since shown on TV'}</span></div><div>${button(state.timer.paused ? 'Resume' : 'Pause', 'pauseTimer', 'small')}${button('Reset timer', 'resetTimer', 'small')}</div></section><div class="question-position">Question ${state.question + 1} of ${qs.length}</div><section class="private-card"><span class="eyebrow">⌑ HOST ONLY</span><strong>${esc(q.answer)}</strong><p>${esc(q.note)}</p></section>`;
      break;
    }
    case 'COLLECTING': controls = `<p>Collect all paper sheets before grading.</p>${button('Start team-by-team grading →', 'grade', 'primary')}`; break;
    case 'GRADING': privateContent = grading(); break;
    case 'GRADING_REVIEW':
      privateContent = `<section class="panel"><h2>Check the round</h2>${state.teams.map(t => `<div class="summary-row"><span>${esc(t.name)}</span><strong>${teamSubtotal(state, t.id)} pts</strong></div>`).join('')}<p class="muted">These totals are private. Approval allows answers to be revealed; the leaderboard stays hidden.</p></section>`;
      controls = button('Approve grading →', 'approve', 'primary', count > 0) + button('Correct a grade', 'corrections'); break;
    case 'ANSWER_REVEAL':
      controls = state.reveal < qs.length - 1 ? button(state.reveal < 0 ? 'Reveal first answer →' : 'Reveal next answer →', 'reveal', 'primary', !state.approved.includes(state.round)) : button('Publish leaderboard →', 'leaderboard', 'primary', !state.approved.includes(state.round));
      if (state.reveal >= 0) controls += button(state.revealTeams ? 'Hide correct teams' : 'Show correct teams', 'toggleTeams');
      controls += button('Correct a grade', 'corrections'); break;
    case 'LEADERBOARD_REVEAL':
      controls = state.leaderboardCount < state.teams.length ? button('Reveal next position →', 'revealRank', 'primary') + button('Show full leaderboard', 'allRanks') : button(state.round === state.rounds.length - 1 ? 'Finish game →' : 'Introduce next round →', 'nextRound', 'primary', !state.approved.includes(state.round));
      controls += button('Correct scores', 'corrections'); break;
    case 'GAME_COMPLETE': controls = `<p>The final results are on TV. Tied teams share their placing.</p>${button('Correct scores', 'corrections')}${button('Start a fresh practice game', 'confirmReset')}`; break;
  }
  if (['ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE'].includes(state.phase) && !state.approved.includes(state.round)) controls = `<div class="notice">Grades changed. Review and approve the corrections before continuing.</div>${button('Approve corrected grades', 'approve', 'primary')}${controls}`;
  if (showCorrections && ['GRADING_REVIEW', 'ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE'].includes(state.phase)) privateContent += `<section class="panel"><div class="section-title"><h2>Correct this round</h2>${button('Close', 'corrections', 'small')}</div>${grading(true)}${adjustmentForm()}${['LEADERBOARD_REVEAL', 'GAME_COMPLETE'].includes(state.phase) ? `${button('Publish revised standings', 'republish', 'primary', !state.approved.includes(state.round))}<p class="muted">The TV keeps the previous standings until you publish.</p>` : ''}</section>`;
  return `<div class="work-grid"><section class="host-work"><div class="section-title"><h1>${esc(state.title)}</h1><span class="round-pill">ROUND ${state.round + 1} / ${state.rounds.length}</span></div><p class="venue-caption">${esc(appearance.venue)}</p><div class="phase-label"><span class="live-dot"></span>${statusLabels[state.phase]}</div><div class="mobile-preview"><div class="section-title"><span class="eyebrow">TV NOW</span><a href="#tv" target="_blank" rel="noopener">Open TV ↗</a></div>${tvSlide(projectDisplay(state), appearance, true)}</div>${privateContent}<div class="controls">${controls}</div></section><aside class="desktop-preview"><div class="section-title"><span class="eyebrow">TV NOW</span><a href="#tv" target="_blank" rel="noopener">Open TV view ↗</a></div>${tvSlide(projectDisplay(state), appearance, true)}<div class="preview-caption"><span class="live-dot"></span>Same-browser preview <span>16:9</span></div><p class="muted">Open the TV view on this browser to practice. Phone-to-TV pairing will arrive with the backend.</p><div class="flow-track">${['Questions', 'Collect', 'Grade', 'Answers', 'Standings'].map((x, i) => `<span class="${[['ROUND_INTRO', 'ASKING'], ['COLLECTING'], ['GRADING', 'GRADING_REVIEW'], ['ANSWER_REVEAL'], ['LEADERBOARD_REVEAL', 'GAME_COMPLETE']][i].includes(state.phase) ? 'active' : ''}"><b>0${i + 1}</b>${x}</span>`).join('')}</div></aside></div>`;
}

function grading(correction = false) {
  const t = state.teams[state.team], qs = roundQuestions(state);
  const incomplete = qs.some(q => state.grades[gradeKey(t.id, q.id)] === undefined);
  return `<div class="grading"><div class="team-select">${label('Team', `<select id="grade-team">${state.teams.map((team, i) => `<option value="${i}" ${i === state.team ? 'selected' : ''}>${esc(team.name)}</option>`).join('')}</select>`)}<span class="muted">Team ${state.team + 1} of ${state.teams.length}</span></div>${correction ? '<label>Correction reason<input id="correction-reason" placeholder="Why is this grade changing?" maxlength="200"></label>' : '<div class="notice">TV stays on intermission during grading.</div>'}${qs.map((q, i) => `<section class="grade-row"><p>${q.bonus ? '<span class="eyebrow">BONUS</span> ' : `${i + 1}. `}${esc(q.prompt)}</p><div class="grade-answer">Answer: <strong>${esc(q.answer)}</strong></div><div class="grade-options" role="group" aria-label="Grade question ${i + 1}">${[0, q.points / 2, q.points].map((points, j) => `<button type="button" data-mark="${q.id}" data-points="${points}" aria-label="${['Incorrect', 'Half credit', 'Correct'][j]}, ${points} points" aria-pressed="${state.grades[gradeKey(t.id, q.id)] === points}" ${busy ? 'disabled' : ''}>${points === 0.5 ? '½' : points}<small>${['Incorrect', 'Half', 'Correct'][j]}</small></button>`).join('')}</div></section>`).join('')}<div class="subtotal"><span>Round subtotal</span><strong>${teamSubtotal(state, t.id)} pts</strong></div>${!correction ? button(state.team < state.teams.length - 1 ? 'Next team →' : 'Review all grading →', 'nextTeam', 'primary', incomplete) + `<p class="muted">${missingGrades(state).length ? `${missingGrades(state).length} marks remaining across all teams.` : 'Every sheet is complete.'} Each mark saves automatically.</p>` : ''}</div>`;
}
function adjustmentForm() {
  return `<details><summary>Manual score adjustment</summary><form id="adjustment-form">${label('Team', `<select name="team">${state.teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>`)}${label('Points to add or subtract', '<input name="points" type="number" min="-100" max="100" step="0.5" value="0" required>')}${label('Reason', input('reason', '', 200))}<button class="primary" type="submit">Save adjustment</button></form></details>`;
}

function teams() {
  const rows = state.phase === 'DRAFT' ? state.teams.map(t => ({ ...t, score: 0 })) : standings(state);
  return `<section class="narrow"><h1>The teams</h1><p class="muted">Private host totals. TV standings change only when you publish them.</p><div class="panel">${rows.map(t => `<div class="summary-row"><strong>${esc(t.name)}</strong><span>${t.score} pts</span></div>`).join('')}</div>${state.phase === 'DRAFT' ? '<a class="button primary" href="#setup">Edit teams in setup →</a>' : '<p class="muted">Teams stay fixed after launch in this practice demo.</p>'}${['GRADING', 'GRADING_REVIEW', 'ANSWER_REVEAL', 'LEADERBOARD_REVEAL', 'GAME_COMPLETE'].includes(state.phase) ? `<section class="panel">${adjustmentForm()}</section>` : ''}<details><summary>Recent game activity</summary><ul class="audit">${state.events.slice(-12).reverse().map(e => `<li><span>${esc(e.type.replace(/([A-Z])/g, ' $1'))}</span><small>${new Date(e.time).toLocaleTimeString()}${e.detail.reason ? ` · ${esc(e.detail.reason)}` : ''}</small></li>`).join('') || '<li>No actions yet.</li>'}</ul></details></section>`;
}

function setup() {
  const a = draftAppearance || structuredClone(appearance);
  draftAppearance = a;
  suggestion = a.logo ? (a.suggestion || suggestion) : null;
  const example = { title: state.title, phase: 'ASKING', round: 1, category: 'General knowledge', question: { prompt: 'Which ocean is the largest on Earth?', number: 2, total: 3, points: 1 } };
  return `<div class="setup-grid"><section><h1>Make it your night</h1><p class="muted">Your venue. Your colors. Preview first, then save.</p><form id="appearance-form"><section class="panel">${label('Venue name', input('venue', a.venue, 60))}<span class="eyebrow">VENUE LOGO</span><div class="logo-well">${venueBrand(a, 'large')}</div><label class="upload-label">Choose logo image<input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="muted">PNG, JPEG or WebP · up to 5 MB. A transparent original logo works best. Photos can pick up background colors. Images stay on this device.</p>${a.logo ? button('Remove logo', 'removeLogo', 'small') : ''}</section><section class="panel"><h2>Color palette</h2><div class="palette-options">${PRESETS.map((p, i) => `<button type="button" class="palette-option" data-preset="${i}" aria-pressed="${a.palette.name === p.name}"><span class="swatches">${[p.accent, p.text, p.background].map(c => `<i style="background:${c}"></i>`).join('')}</span>${p.name}</button>`).join('')}</div>${suggestion ? `<div class="suggestion"><div class="section-title"><h3>Suggested from your logo</h3><span class="swatches">${suggestion.colors.map(c => `<i style="background:${c}" title="${c}"></i>`).join('')}</span></div><p class="muted">Use this suggestion or pick another palette. Dark colors are lightened where needed for readable controls.</p>${button('Use suggested palette', 'useSuggestion', 'primary')}</div>` : ''}<div class="custom-color">${label('Accent color', `<input type="color" id="accent-color" value="${a.palette.accent}">`)}<span class="muted">We keep text and buttons readable.</span></div></section><section class="panel"><h2>Question timer</h2>${label('Timer mode', `<select name="timerMode"><option value="elapsed" ${a.timerMode === 'elapsed' ? 'selected' : ''}>Elapsed time</option><option value="countdown" ${a.timerMode === 'countdown' ? 'selected' : ''}>Countdown</option></select>`)}${label('Countdown duration (seconds)', `<input name="countdown" type="number" min="10" max="600" step="1" value="${a.countdown}" required>`)}<label class="check-row"><input name="showTimer" type="checkbox" ${a.showTimer ? 'checked' : ''}>Show timer on TV</label><p class="muted">Starts when each question appears. Expiration never reveals or advances anything.</p></section><button class="primary" type="submit">Save appearance</button></form></section><aside><div class="sticky-preview"><span class="eyebrow">PALETTE PREVIEW</span>${tvSlide(example, a, true)}<p class="muted">Unsaved appearance preview</p></div>${gameSetup()}</aside></div>`;
}
function gameSetup() {
  if (state.phase !== 'DRAFT') return `<section class="panel"><h2>Practice game</h2><p>${esc(state.title)} · ${state.teams.length} teams · two rounds</p>${state.phase === 'READY' ? button('Edit game setup', 'edit') : '<p class="muted">Questions and teams are frozen after launch.</p>'}${button('Reset practice game', 'confirmReset')}</section>`;
  return `<section class="panel"><h2>Practice game</h2><p class="muted">Two rounds, two questions each, plus optional two-point bonuses.</p><form id="game-form">${label('Game name', input('title', state.title))}${label('Teams (one name per line, 2–8 teams)', `<textarea name="names" rows="3" required>${state.teams.map(t => esc(t.name)).join('\n')}</textarea>`)}${state.rounds.map((r, i) => label(`Round ${i + 1} category`, input(`category${i}`, r.category, 50))).join('')}<label class="check-row"><input name="bonus" type="checkbox" ${state.bonus ? 'checked' : ''}>Include bonus questions</label><details><summary>Preview or edit sample questions</summary>${state.rounds.flatMap(r => r.questions).map((q, i) => `<div class="edit-question"><span class="eyebrow">ROUND ${Math.floor(i / 3) + 1} · ${q.bonus ? 'BONUS' : `QUESTION ${i % 3 + 1}`}</span>${label('Question', `<textarea name="prompt${i}" maxlength="400" required>${esc(q.prompt)}</textarea>`)}${label('Answer', input(`answer${i}`, q.answer, 200))}</div>`).join('')}</details><button class="primary" type="submit">Save game & get ready →</button></form></section>`;
}

function render() {
  const view = route();
  applyTheme(view === 'setup' && draftAppearance ? draftAppearance : appearance);
  if (view === 'tv') {
    app.innerHTML = `<div class="tv-page"><div class="tv-demo-label">DEMO · SAMPLE DATA · SAME BROWSER ONLY <a href="#host">Back to host</a></div>${tvSlide(projectDisplay(state))}</div>`;
    return;
  }
  app.innerHTML = `<header><a href="#host" class="wordmark">trivi<span>app</span></a><span class="demo-pill">DEMO · SAMPLE DATA</span><span class="save-status">${busy ? 'Saving…' : error ? 'Check save status' : state.revision > 0 ? 'Saved on this device' : 'Device-only practice'}</span></header><div class="demo-notice">Practice mode · local browser data · no login or secure TV pairing yet</div><main>${error ? `<div class="notice error" role="alert">${esc(error)}</div>` : ''}${message ? `<div class="notice success" role="status">${esc(message)}</div>` : ''}${resetConfirm ? `<section class="panel reset-confirm"><h2>Start a fresh practice game?</h2><p>This clears this browser’s game and scores. Your venue appearance stays.</p>${button('Reset game', 'reset', 'primary')}${button('Keep current game', 'cancelReset')}</section>` : ''}${view === 'setup' ? setup() : view === 'teams' ? teams() : host()}</main>${navigation()}<footer>Practice freely. Real host authentication and multi-device sync are the next milestone.</footer>`;
}
async function execute(action) {
  if (busy) return;
  error = ''; message = ''; busy = true; render();
  try { state = await store.execute(action, state.revision); }
  catch (e) { error = `${e.message} Your last saved game is preserved.`; }
  finally { busy = false; render(); }
}
function captureAppearanceForm() {
  const f = document.querySelector('#appearance-form');
  if (!f || !draftAppearance) return;
  const data = new FormData(f);
  draftAppearance.venue = String(data.get('venue')); draftAppearance.timerMode = data.get('timerMode');
  draftAppearance.showTimer = data.has('showTimer'); draftAppearance.countdown = Number(data.get('countdown'));
}

app.addEventListener('click', async e => {
  const el = e.target.closest('button'); if (!el || busy) return;
  if (el.dataset.mark) {
    const reason = document.querySelector('#correction-reason')?.value;
    await execute({ type: 'mark', team: state.teams[state.team].id, question: el.dataset.mark, points: Number(el.dataset.points), reason }); return;
  }
  if (el.dataset.preset !== undefined) { captureAppearanceForm(); draftAppearance.palette = safePalette(PRESETS[Number(el.dataset.preset)]); render(); return; }
  const type = el.dataset.action; if (!type) return;
  if (type === 'corrections') { showCorrections = !showCorrections; render(); return; }
  if (type === 'useSuggestion') { captureAppearanceForm(); draftAppearance.palette = suggestion.palette; render(); return; }
  if (type === 'removeLogo') { captureAppearanceForm(); draftAppearance.logo = null; draftAppearance.suggestion = null; suggestion = null; render(); return; }
  if (type === 'confirmReset' || type === 'cancelReset') { resetConfirm = type === 'confirmReset'; render(); return; }
  if (type === 'reset') {
    try { state = await store.reset(); resetConfirm = false; showCorrections = false; error = ''; message = 'Fresh practice game created.'; location.hash = 'setup'; render(); } catch (e) { error = e.message; render(); } return;
  }
  if (type === 'nextTeam') {
    if (state.team < state.teams.length - 1) await execute({ type: 'selectTeam', index: state.team + 1 });
    else await execute({ type: 'review' });
    return;
  }
  await execute({ type });
  if (type === 'edit') { location.hash = 'setup'; }
});

app.addEventListener('change', async e => {
  if (e.target.id === 'grade-team') { await execute({ type: 'selectTeam', index: Number(e.target.value) }); return; }
  if (e.target.id === 'accent-color') { captureAppearanceForm(); draftAppearance.palette = safePalette({ ...draftAppearance.palette, name: 'Custom', accent: e.target.value }); render(); return; }
  if (e.target.id === 'logo-upload') {
    const file = e.target.files[0]; if (!file) return;
    captureAppearanceForm(); const uploadedDraft = draftAppearance;
    error = ''; message = 'Reading logo colors…'; busy = true; render();
    try {
      const result = await processLogo(file); uploadedDraft.logo = result.logo; uploadedDraft.suggestion = result.suggestion; suggestion = result.suggestion;
      message = 'Logo ready. Try its suggested palette below, then save appearance.';
    } catch (e) { error = e.message; message = ''; }
    busy = false; render();
  }
});
app.addEventListener('submit', async e => {
  e.preventDefault(); const data = new FormData(e.target);
  if (e.target.id === 'appearance-form') {
    captureAppearanceForm();
    try { appearance = saveAppearance(draftAppearance); draftAppearance = structuredClone(appearance); error = ''; message = 'Appearance saved on this device.'; }
    catch (e) { error = `Appearance was not saved: ${e.message}`; message = ''; }
    render();
  } else if (e.target.id === 'game-form') {
    await execute({ type: 'configure', title: String(data.get('title')), names: String(data.get('names')).split('\n').map(n => n.trim()).filter(Boolean), categories: [String(data.get('category0')), String(data.get('category1'))], bonus: data.has('bonus'), questions: Array.from({ length: 6 }, (_, i) => ({ prompt: String(data.get(`prompt${i}`)), answer: String(data.get(`answer${i}`)) })) });
    if (!error) { location.hash = 'host'; render(); }
  } else if (e.target.id === 'adjustment-form') await execute({ type: 'adjust', team: data.get('team'), points: Number(data.get('points')), reason: String(data.get('reason')) });
});

addEventListener('hashchange', () => { if (route() !== 'setup') draftAppearance = null; error = ''; message = ''; render(); });
subscribe(async () => { try { state = await store.load(); render(); } catch (e) { error = e.message; render(); } });
addEventListener('storage', e => { if (e.key === APPEARANCE_KEY) { try { appearance = loadAppearance(); render(); } catch (e) { error = e.message; render(); } } });
setInterval(() => {
  document.querySelectorAll('[data-timer]').forEach(el => el.textContent = timerText(route() === 'setup' && draftAppearance ? draftAppearance : appearance));
  const status = document.querySelector('[data-timer-status]');
  if (status && appearance.timerMode === 'countdown' && timerMillis() >= appearance.countdown * 1000) status.textContent = 'Time is up — you decide when to move on';
}, 500);

try { state = await store.load(); appearance = loadAppearance(); }
catch (e) { state = newGame(); appearance = defaultAppearance(); error = e.message; resetConfirm = true; }
render();
