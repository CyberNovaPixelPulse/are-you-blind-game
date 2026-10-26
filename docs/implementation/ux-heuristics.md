# UX heuristic improvements — 2026-10-26

Scope: implement the seven findings from the UX audit in this chat. Preserve existing game rules, question publication and answer-adoption behavior, and unrelated working-tree changes.

## Acceptance

- UX-01: The leaderboard opens with focus inside it, keeps Tab and Shift+Tab inside, closes with Escape, and returns focus to the trigger. Background content must be inert while it is open.
- UX-02: A guest sees a primary start-guessing action and an explicit no-sign-in-needed message before the honor card. Creating a quiz is secondary.
- UX-03: While an answer request is pending, display an accessible checking-answer status and prevent duplicate guesses. Preserve existing retry and verdict behavior.
- UX-04: Casual-play answer options wrap without ellipsis. On short screens, the page scrolls so full options and the next-question action remain reachable.
- UX-05: Use the same Google sign-in control on the homepage and create page, returning creators to `/create`. Retain email sign-in and add a working password-reset request and update page with validation and recoverable errors.
- UX-06: Localize the homepage daily entry, primary start action, and casual-play pending/retry/unavailable/load-failure controls. Include English and RTL validation. New account copy may use explicitly marked English fallback, following existing fallback conventions.
- UX-07: Increase the audited back, language, and leaderboard close controls to at least 44px; apply the same minimum to create-page account controls.

## Agreed test boundary

The user approved browser-level regression tests for leaderboard keyboard focus, the guest start action, readable long options, and pending-answer feedback. Test at the rendered UI and HTTP boundaries, using the existing browser fixtures. External Google OAuth, actual password mail delivery and payment services are outside this automated boundary.

## Password recovery integration

Uses the existing browser Supabase client and its session detection. Request an email with `resetPasswordForEmail`, redirect to `/reset-password`, then use `updateUser` only when a session exists. Invalid or expired links allow another request; password updates require confirmation. No auth-provider configuration or production account state is changed.

The deployed origin plus `/create` and `/reset-password` must be allowed in the project's Auth redirect URL configuration. A local HTTP-fixture pass does not establish real email delivery or hosted redirect configuration. References: [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [updating the authenticated user](https://supabase.com/docs/reference/javascript/auth-updateuser).

## Validation results

- Type checking and production build passed.
- Full unit suite: 36 passed.
- Final full browser suite: 38 passed, including six new UX cases, English and Arabic at 320×480, pending submissions, long options and keyboard modal behavior.
- Standards review: no findings. Spec review: fallback language labeling and English/RTL validation findings were addressed; no remaining findings.
- Lint passes for the new files and the other changed components without existing lint issues. The existing create, play and auth-menu files retain the same lint rule counts as the pre-change snapshots. Full-project lint remains blocked by 22 existing errors and 16 warnings; this work introduces no additional lint diagnostics.
- Real OAuth redirects and password-email delivery were not exercised. The reset-request page was checked in the browser; no actual account email or password was submitted.
