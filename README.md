# TRIVIAPP

A host-led pub trivia platform for a brewery, with a reusable venue platform as a future direction.

Status: planning foundation. No application, deployed site, or connected Supabase project yet.

## Product source of truth

Based on the owner's TRIVIAPP Product & Technical Handoff, version 1.0, October 7, 2026. The requirements below summarize that handoff; omissions do not override the original.

One human host reads questions aloud one at a time while a TV displays them. Teams collaborate and write answers on ordinary paper. After sheets are collected, the host grades privately, team by team. Answers are then revealed individually. The leaderboard comes last for suspense.

## Confirmed requirements

- Host manually controls every transition. Timer expiration never advances or reveals anything.
- Audience sees one question at a time.
- Paper answers; no player phones, buzzers, answer submission, printer requirement, or timing-based player points in V1.
- Host manages teams, stable team IDs, names, scores, and game progression.
- Builder configures round count, questions per round, categories, optional bonuses, selection, ordering, replacement, editing, and preview.
- Reusable category/question library, custom sets, duplicate avoidance, and prior-use tracking.
- Grade one team's complete sheet before moving to the next team.
- Missing required marks block round finalization.
- Answers never appear on TV before grading is finished and confirmed.
- Reveal answers individually; optionally reveal teams that answered correctly.
- Publish updated standings only in the leaderboard phase, after answer reveals.
- Bonuses follow the same privacy and reveal rules.
- Single authorized host controls presentation; TV credentials cannot control games.
- Host refresh and TV reconnect recover persisted progress.
- A publicly revealed answer cannot become secret again through backward navigation.
- Host can pause or skip animations and display the full leaderboard immediately.
- Grade corrections and explicit score adjustments are auditable.
- Ties are shown honestly; do not arbitrarily choose a winner.
- TV retains its last safe slide during connectivity loss. Host sees explicit connection/save status.
- Never claim an action saved when the server has not acknowledged it.
- Question snapshots are frozen on launch; later library edits cannot silently change a live game.
- Deliberate live question edits must preserve scoring and reveal safety.

## Game state

DRAFT → READY → ROUND_INTRO → ASKING → COLLECTING → GRADING → GRADING_REVIEW → ANSWER_REVEAL → LEADERBOARD_REVEAL → NEXT_ROUND or GAME_COMPLETE.

ASKING and ANSWER_REVEAL advance one question at a time under host control. NEXT_ROUND leads to the following ROUND_INTRO. Server validation enforces allowed transitions.

## Proposed architecture

These implementation choices remain recommendations pending owner approval:

- React + TypeScript + Vite frontend.
- GitHub Pages with Vite base /Triviapp/ and hash routing.
- Supabase Auth, PostgreSQL, backend functions, and Realtime.
- Framework-independent game state machine, scoring, and presentation projection, with storage adapters.
- Authenticated host console separate from the display client.
- Server-generated display projection persisted separately from private game data.
- Transactional commands with ownership checks, expected revision, idempotency key, and one active operator lease.
- Safe display snapshot resynchronization after reconnect, with revision ordering to reject stale messages.

The owner has agreed to start with Supabase Free for development. Production Pro is recommended before live brewery use; no paid service is authorized by this repository setup.

## Privacy and access control

Private answers, accepted answers, host notes, grades, calculated unpublished totals, and future question prompts must not be bundled into the TV application or sent to the TV in hidden JSON.

Host commands authenticate ownership and validate transitions on the server. Sensitive mutations occur through controlled transactional operations rather than unrestricted client writes.

Enable row-level security and least-privilege grants on exposed tables. Display credentials cannot read private tables or invoke host commands. Do not use an unrestricted public view over private data.

A short-lived pairing code is exchanged through a rate-limited server endpoint for an expiring, revocable, display-only credential. Store credential hashes where appropriate. Authorize Realtime subscriptions separately and deny display publishing.

Each accepted host command persists authoritative state, an audit event, and the safe presentation projection in one transaction. Notifications follow commit; snapshots remain the source of truth.

Round grading approval permits answer reveal but does not publish scores. Leaderboard publication stores an explicit standings snapshot. Grade corrections recalculate private totals; revised public standings require a deliberate host publication. Previously revealed answers remain in the reveal history.

No service-role keys, database passwords, access tokens, or pairing secrets in source control, frontend builds, logs, or public workflows. Public project URLs and publishable keys do not replace authorization.

## Proposed schema

UUID primary keys; timestamps; explicit foreign keys; owner/game ownership validated for all relationships.

| Table | Responsibilities |
| --- | --- |
| profiles | Authenticated host identity |
| venues | Venue name and owner |
| categories | Owned category library |
| questions | Owned editable question records |
| games | Owner, venue, configuration, launch status |
| rounds | Game, order, category configuration, grading approval |
| round_questions | Ordered frozen snapshots, original question ID, points, bonus flag |
| game_sessions | Phase, cursors, revision, active operator lease |
| teams | Game, stable ID, name, active status |
| grades | Unique team/question mark, awarded points, revision, editor |
| score_adjustments | Team, delta, reason, actor, time |
| session_events | Commands and before/after audit history |
| display_pairings | Session, credential hash, expiration, revocation |
| display_states | Sanitized current slide, revision, reveal history |
| published_standings | Deliberately published standings snapshot |

Use exact numeric scoring. Recommended defaults: correct 1, incorrect 0, optional half credit 0.5; support per-question points. Derive totals from grades and adjustment records. Validate permitted award ranges and prevent cross-game references.

Question fields: id, prompt, answer, accepted_answers[], category_id, subcategory, difficulty, tags[], type, point_value, host_notes, explanation, source_url, last_verified_at, media_url, status, created_at, updated_at.

Question packs and templates belong in content tooling. Organizations and memberships are deferred commercial work.

## Routes and component boundaries

Routes are hash paths beneath /Triviapp/:

| Route | Screen |
| --- | --- |
| /login | Host authentication |
| / | Dashboard and resume |
| /games/new | Builder |
| /games/:id/edit | Draft editing |
| /games/:id/teams | Team management |
| /games/:id/host | Live host console |
| /games/:id/grade/:teamId | Team grading |
| /tv | Pairing and presentation |
| /library | Content tooling |
| /templates | Reusable game tooling |

UI modules: GameBuilder, TeamManager, HostConsole, PhaseControls, TeamGrading, GradingReview, AudienceSlide, LeaderboardReveal, SyncStatus.

Domain modules: transition validation, grading completeness, score calculation, reveal history, sanitized projection. Infrastructure modules: authentication, command transport, persistence, display subscription.

Mobile host console prioritizes current phase, save/sync status, TV preview, private answer/notes, and large touch controls. TV uses high-contrast dark slides, large typography, 16:9 layouts, neutral grading intermissions, tasteful animation, reduced motion, and keyboard accessibility. Sounds and mute follow later.

## Implementation milestones

1. Foundation: approve unresolved choices; scaffold app, state machine, migrations, authentication, security tests, and CI.
2. Vertical slice: builder, teams, pairing, full two-round flow, grading, reveals, standings, corrections, and recovery.
3. Content tools: library editor/filtering, random selection, duplicate detection, versioned validated JSON import/export, templates, bonuses, and use history.
4. Operational polish: timers, animation controls, sounds, audit UI, accessibility, connectivity handling, restore testing, and deployment documentation.
5. Future commercial foundation: multiple venues, tenancy, permissions, branding, analytics. Subscriptions require explicit approval.

Use focused commits and reviewable pull requests. Security and basic recovery are requirements of the vertical slice, not deferred polish.

## Smallest working vertical slice

One authenticated host, one venue, three teams, two rounds with two manually entered questions each, and an optional ordinary graded bonus.

Complete the whole state flow with half credit, grading completion checks, private intermission, approval, individual answer reveals, optional correct-team display, bottom-up standings with pause/skip/reduced motion, honest ties, grade corrections, and host/TV refresh recovery.

This is an acceptance fixture, not a permanent product capacity limit. An initial working game must not require a large prelicensed question bank.

## Testing and deployment

- Unit tests: allowed transitions, numeric scoring, bonuses, ties, incomplete grades, irreversible public reveals.
- Database/security tests: owner, unrelated host, display, anonymous access; deny private reads and unauthorized writes; expiry/revocation; cross-game references; duplicate commands; stale revisions; operator conflicts.
- Two-browser tests: inspect actual TV HTTP and WebSocket payloads for hidden answers and premature totals.
- Recovery tests: host/TV refresh, dropped connection, reconnect snapshots, failed saves, duplicate retries, stale tabs.
- CI: typecheck, meaningful tests, production build, migration validation, deployment smoke test at the project path.
- Deployment: version migrations and functions in GitHub; deploy via GitHub Actions with encrypted credentials. Deploy compatible backend changes before the dependent frontend.
- Document free-tier limits, inactivity pauses, operational checks, monitoring, and backup/restore procedure before live use.
- No promise of true offline multi-device synchronization.

Supabase account/project creation and deployment secrets are pending owner sign-in. No deployment workflow is enabled in this initial documentation commit.

## MVP acceptance checklist

- [ ] Host authenticates and creates a two-round game with different categories and optional bonus.
- [ ] Adds three teams, launches, pairs a read-only TV.
- [ ] Questions display sequentially; TV receives no unrevealed answers.
- [ ] Host grades every question for team A, then B, then C.
- [ ] Partial credit/bonuses calculate correctly; incomplete grading blocks approval.
- [ ] TV stays on intermission throughout private grading.
- [ ] Approved answers reveal individually, with optional correct teams.
- [ ] Updated leaderboard stays hidden until triggered and reveals bottom-up.
- [ ] Corrections recalculate totals accurately.
- [ ] Host/TV refresh preserve and recover progress.
- [ ] Unauthorized clients cannot control games or read hidden answers.
- [ ] CI succeeds and deployment works at the GitHub Pages project URL.

## Owner decisions still open

| Decision | Proposed default |
| --- | --- |
| Frontend/backend architecture | React, TypeScript, Vite, Supabase, GitHub Pages |
| Categories | One category per round initially; allow future mixed rounds |
| Bonus | Ordinary graded question with configurable points; no wagers |
| Capacity | Validate 30 teams, 10 rounds, 10 questions per round |
| Voiding | Host may void a question for all teams with audited reason |
| Device setup | Phone host console plus separate TV browser; support laptop |
| Brand | TRIVIAPP with professional dark game-show styling |

No player phones, buzzers, player submission, mandatory printing, payment processing, subscription billing, complex host roles, or sophisticated media licensing in V1.

Use modest fact-checked sample questions with sources and verification dates when seeding. Do not scrape copyrighted question banks.

## Next coding task

Read this README and inspect the repository before edits. Confirm the unapproved architecture choices before committing to them. Implement only the foundation milestone in a focused PR, then deliver the end-to-end vertical slice in subsequent reviewable increments. Keep confirmed requirements, proposed choices, and future features separate.

Official deployment references:
- [Supabase environments and GitHub Actions](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Vite GitHub Pages deployment](https://vite.dev/guide/static-deploy.html)
