# Web Interface Guidelines follow-up

Date: 2026-10-27 (Asia/Taipei).

Scope: reassess the previous 39 UI findings against the actual working tree, reproduce layout/keyboard issues, and fix confirmed problems while retaining the existing visual design and unrelated uncommitted work. No deployment, database change or Git commit is part of this follow-up.

The latest [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) were fetched at the start and again for the final review. Existing dirty files were snapshotted before edits; changes were reviewed against that snapshot, not just against HEAD.

## Confirmed and fixed

### Admin board — findings 1–5 and 7

- Login/filter and edit controls now have visible keyboard outlines. Tailwind 4 requires an explicit solid outline style when replacing `outline-none`; width alone was insufficient. Browser checks cover both control groups.
- The difficulty select has an accessible label.
- Review and nested save/delete/leave/report-resolution confirmations share modal focus handling: focus entry, Tab containment, Escape, inert background, and restoration to the previous control.
- Sort/status/difficulty/language filters are validated and stored in query parameters. A browser test reproduces the former reset-on-reload bug and verifies persistence afterward. Filter changes replace history rather than adding an entry for every change.
- Toasts and asynchronous errors have status/alert semantics.
- Deliberate limit for finding 5: editor selection and unsaved draft contents remain transient. They are not serialized into the URL; the stable filters are shareable, the editing session is not.

### Quiz creation — findings 8–13

- Hidden file input exposes focus through its label; author, option and taunt controls have names/autocomplete metadata, with spelling disabled for author names.
- Validation identifies, describes and focuses the first invalid field, with its message next to the control.
- Edited quiz content is protected by a native before-unload warning and confirmation for in-page links that leave the route. Canceling the confirmation preserves the field contents in the browser test.
- This guard does not claim to intercept the Next.js SPA browser Back gesture; durable restoration of image/crop drafts remains outside this change.
- Score/review dialogs share modal keyboard handling and bounded internal scrolling.
- Original moderation sizing was replayed with long synthetic feedback at 320×480: the heading was outside the viewport. The corrected dialog exposes its heading and scrolls to the recovery action. No paid AI call or real publication was used.

### Challenge and PK — findings 14–19

- Actual last-rendered answer options are reachable by wheel scrolling on short screens. Fixed-height clipping was reproduced with the original layout, then challenge and PK cases each passed three consecutive runs after the fix.
- Test correction: answer order is randomized, so an option with a fixed label is not necessarily the last option. The regression tests now identify the actual final rendered control.
- Challenge results use the common modal behavior; result notices expose status updates.
- PK verdicts include visible correct-answer/selected-answer text rather than relying solely on red/green.
- Room-code input has a name, autocomplete policy and spelling disabled; its alphanumeric input behavior is preserved.

### Shared controls — findings 20–25, 27–30, 32–36

- Report details have a persistent label. Report/result/profile/ad/VIP dialogs use shared focus handling; nested report and admin confirmation tests cover focus restoration. Existing native leaderboard focus handling is retained and takes precedence above custom dialogs.
- Profile navigation is a real link. Profile dialog has bounded scrolling and nickname metadata.
- VIP radio cards show focus without changing the consent requirement, prices or checkout behavior.
- Ad dialog isolates background controls while retaining the five-second rule and automatic continuation. Countdown remains visually positioned as before and is inside the accessible dialog.
- Language options support ArrowUp/Down, Home/End and Escape, including trigger focus restoration.
- Leaderboard scroll region contains overscroll.
- Reduced-motion preference disables the remaining streak pulse, reveal animation and confetti; normal effects remain unchanged.
- Casual/challenge pages have main landmarks; casual play has a screen-reader heading. A keyboard-only skip link targets page main content without altering the resting layout.
- Password-reset controls have names and error associations; password mismatch focuses the confirmation field.
- Existing light/dark colors are retained; matching native `color-scheme` and media-specific `theme-color` are configured. Dark native-control styling is checked in the browser.

## Not adopted

- Findings 6 and 31 — automatic list virtualization: unbounded lists warrant monitoring, but no representative large dataset or measured rendering bottleneck was established. Do not add a virtualization dependency, change selection behavior or introduce pagination solely from `.map()` usage.
- Finding 26 — fixed ad width: original width behavior fits 320px in the browser; the flex item shrinks. The earlier horizontal-overflow claim was not confirmed. Width/ad-slot configuration is unchanged; only dialog accessibility was fixed.
- Finding 37 — numeric dimensions on every raw image: current avatar/crop containers already reserve size through fixed CSS dimensions or aspect ratios. No layout-shift evidence justified invented intrinsic dimensions or replacing the existing image strategy.
- Finding 38 — global touch/tap-highlight changes: no interaction defect was reproduced. Preserve native zoom, crop gestures and existing tap behavior instead of applying a sitewide override.

## Not yet verified

- Finding 39 — notch/home-indicator safe areas: desktop viewport emulation cannot establish iPhone Safari or standalone/PWA behavior. Current viewport does not opt into `viewport-fit=cover`; no speculative global padding was added.
- VoiceOver announcements, Windows native selects, actual touch/soft-keyboard behavior and mobile browser chrome require real-device checks. DOM roles/focus and Chromium responsive checks are evidence for those boundaries only.
- Live data-volume performance and hosted authentication/payment/publication services were not exercised. All regression fixtures isolate external effects.

## Verification and final scoped review

- Full unit suite: 36/36 passed.
- Full browser suite: 54/54 passed, including 16 new cases. Final focused modal/admin/ad checks: 4/4 passed; final unsaved-link guard check: passed.
- Challenge/PK scrolling: six consecutive checks across the two modes passed after reproducing the original clipping.
- TypeScript check and production build passed. Temporary admin fixture route was removed before the build; it is not shipped.
- New helpers and focused new/changed files pass targeted lint. Full lint remains at 21 existing errors and 16 warnings; per-file comparison against pre-change snapshots found no added diagnostics. The replaced VIP focus implementation removes one previous ref lint error.
- Final Web Interface Guidelines review covered the changed source files and helpers. Confirmed label/focus/feedback/navigation/reduced-motion/form issues in this scope are addressed. The explicit exceptions above remain exceptions, not claims of complete sitewide compliance.
- Existing gradients, colors, typography, rounded shapes and normal animation intent are preserved. No new design system or package dependency was introduced.

Regression entry points: `tests/browser/interface-guidelines.spec.ts`, `tests/browser/admin-interface.spec.ts`; existing answer-roundtrip, pool, publication and UX suites also ran. Admin tests render the real component with synthetic props through a temporary local route and remove it afterward; they do not unlock the real admin or delete/save real records.
