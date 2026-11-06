---
name: "AreYouBlind — B Quiz Station"
description: "Implemented site-wide B visual system; reviewed for local full-site preview, not production release."
colors:
  primary: "#c84b10"
  primary-hover: "#993608"
  paper: "#f2f0f7"
  ink: "#302348"
  muted: "#665974"
  line: "#d5cedf"
  white: "#ffffff"
  mode-hover: "#e9e4f0"
  mode-hover-line: "#8c7c9e"
  casual-surface: "#faf4ee"
  casual-line: "#bd541e"
  casual-hover: "#f7e8dc"
  casual-hover-line: "#a53d0a"
  marker: "#8a7b9c"
  chevron: "#7b6c8c"
  focus: "#725698"
  panel: "#ffffff"
  dark-paper: "#211b2d"
  dark-ink: "#f1eaf7"
  dark-panel: "#30263e"
  dark-line: "#62536f"
  dark-muted: "#c4b8cf"
  dark-selected: "#402c2a"
  selection: "#e3c3b6"
  focus-global: "#9573bf"
  scrollbar: "#8a7e9c"
  zinc-950: "#302348"
  zinc-900: "#3b304b"
  zinc-800: "#514360"
  zinc-700: "#635470"
  zinc-600: "#665974"
  zinc-500: "#6b6076"
  zinc-400: "#a89db4"
  zinc-300: "#c7bdd2"
  zinc-200: "#d5cedf"
  zinc-100: "#e9e4f0"
  zinc-50: "#f2f0f7"
typography:
  display:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "clamp(36px, 4vw, 50px)"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "12px"
    lineHeight: 1.6
  headline:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  dialog-title:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "24px"
    fontWeight: 900
    lineHeight: "32px"
  field:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  caption: "4px"
  utility: "8px"
  panel: "12px"
  dialog: "16px"
  reading: "1rem"
  pill: "9999px"
spacing:
  small: "8px"
  medium: "16px"
  large: "20px"
  section: "28px"
  compact: "12px"
  panel: "24px"
  form: "32px"
  desktop-game-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.panel}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  mode-entry:
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "12px 20px"
  mode-casual:
    backgroundColor: "{colors.casual-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  button-utility:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.utility}"
  action-shared:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.panel}"
  panel-shared:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  dialog-shared:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
  field-shared:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.utility}"
    padding: "0 12px"
    height: "44px"
  chip-neutral:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.utility}"
    padding: "6px 12px"
---

# Design System: AreYouBlind — B Quiz Station

## Overview

**Creative North Star: "The Quiz Station"**

The Quiz Station is the implemented site-wide B system, extended after the user approved the B homepage and authorized the remaining UI. It covers casual and challenge/daily play, PK, creation and personal questions, account/password tools, reading pages, administrative presentation, leaderboard, VIP, report and advertisement dialogs, and report-image export. The homepage retains its approved light composition; other screens adapt the language to their task and automatic dark mode.

Lavender ground, plum ink, orange actions, Chinese sans typography and fine borders create a calm frame for an irreverent picture game. Genuine question images, meme illustrations, scoring feedback and semantic red/green remain content rather than being repainted as brand decoration. Editors and reading pages use compact headings and familiar content ordering instead of repeating the homepage hero.

Independent review of all 40 final captures returned SHIP at local full-site preview scope. This describes implemented visual conventions, not production-release approval or complete accessibility certification. Visual evidence and its limits are recorded in `.impeccable/review/site-b/result.md`. No commit, push or deployment is authorized by this document. Earlier A/homepage build-phase state is historical and is not closed or repaired by this extension.

**Key Characteristics:**

- Lavender/plum surfaces with burnt-orange primary actions and automatic dark mode.
- Flat bordered panels, compact typography and task-specific layouts.
- Real question and meme content with legible semantic feedback.
- Visible focus, localized controls and natural small-screen scrolling.

## Colors

### Primary

Burnt orange marks ordinary primary actions, selected plans and homepage casual emphasis. The deeper hover gives immediate feedback. White on the primary orange is approximately (4.70:1); do not substitute the lighter orange from the concept board.

### Neutral

The frontmatter records light and dark primitives. Root semantic variables are authoritative: `--background`, `--foreground`, `--game-panel`, `--game-line`, `--game-muted`, `--game-accent`, `--game-accent-hover` and `--game-selected`. The dark scheme switches canvas, foreground, panel, line, muted and selected values through `prefers-color-scheme`; the accent stays orange. The homepage module deliberately fixes its approved light scheme.

The existing zinc utility names now map to the plum scale in `@theme inline`; they are compatibility aliases, not a second gray identity. Use the root semantic variables for new shared surfaces. Selection tint, scrollbar thumb and global focus color are documented alongside the homepage focus variant. Sidecar tonal strips are synthesized visualization metadata, not extra production tokens or a replacement for the actual zinc scale.

### Semantic colors

Tailwind red, emerald/green and amber retain error, correct-answer and warning meanings. White-text verdict blocks use darker red/emerald fills where implemented; lighter translucent feedback uses dark semantic text in light mode and lighter semantic text in dark mode. The share card retains its own red picked-answer and green correct-answer treatments. These are state-specific assignments, not interchangeable decorative accents.

**The Semantic Feedback Rule.** Keep red and green for genuine errors, verdicts and status; orange remains the general primary action.

## Typography

**Display Font:** Noto Sans TC, with Geist and sans-serif fallbacks.
**Body Font:** Noto Sans TC, with Geist and sans-serif fallbacks.
**Label/Mono Font:** Geist Mono where an existing monospace role is used.

Noto Sans TC now loads once in the root through `next/font/google`, exposed as `--font-game-sans` and incorporated in `--font-sans`. Generated font assets are self-hosted; swap display and preload disabled are retained. The homepage no longer imports its own font. Shared report export explicitly uses the game sans family. Preview snippets inherit the root font variable with a named sans fallback; they do not bundle fonts.

### Hierarchy

- **Display:** Homepage introduction only, using the frontmatter display clamp. Below (900px), its clamp is `clamp(26px, 5.9vw, 38px)`. Chinese sentence spans preserve two introduction lines. Brand type uses (26px, 800, 1.3, -0.03em), narrowing to (22px).
- **Headline:** Tool/read page headings use the fixed (30px) scale. Workspace/admin headings receive the shared heavy weight, tight tracking and line height from the headline role. Individual challenge titles can use weight (900).
- **Dialog title:** Major dialog/ranking headings commonly use the fixed (24px / 32px) role; report titles can use (20px).
- **Title:** Homepage entry titles use (19px / 1.4, 700), narrowing to (18px). Other section headings commonly use (18px) rather than the homepage display role.
- **Body:** Mode hints and secondary form copy use the (14px) role. Game answers retain their existing (16px) reading size; reading pages use line height (1.8).
- **Label:** Compact supporting labels use (12px); specific badges retain (11px). Numbers use tabular figures where scores, countdowns or rankings need stable widths.

**The Task Before Template Rule.** Carry the shared palette, type and shapes across screens; choose layout around the actual game, editor or reading task rather than repeating the homepage composition.

## Layout

### Homepage

The approved centered shell is `min(100% - 6rem, 1240px)`. Desktop photo and entries use a (1.12fr / 1fr) grid with gaps (18px / 28px); the photo spans entry and start rows with minimum height (420px). At widths up to (899px), the shell becomes `min(100% - 40px, 620px)` and the order becomes photo, start, then modes. The photo height uses `clamp(200px, 60vw, 300px)`, fixed to (200px) at widths up to (430px). Utilities move to their own row at that narrow breakpoint.

The primary entry minimum height is (58px), narrowing to (54px); mode entries are at least (76px), increasing to (82px) with mobile padding (14px 16px). The smaller title and earlier mobile start intentionally adapt the original concept. Entries navigate directly; markers do not select a mode. Directional chevrons rotate for RTL and header utilities retain left-to-right ordering.

### Games, tools and reading

At widths of at least (900px), casual/challenge question stages pair the image and answers in a (1.12fr / 1fr) grid with gap (40px). The image is capped at (480px); answers use their available column. PK battle uses the same station structure, with status content spanning both columns. Small screens retain their prior image/height constraints and natural vertical scrolling; do not infer a new crop or scoring rule from the desktop layout.

Forms and admin workspaces keep labeled fields, section grouping and compact fixed headings. Common field heights are (44px) and card padding commonly uses (16px), (20px) or (24px). The shared reading measure is (75ch); reading blocks use padding `clamp(1.25rem, 4vw, 2rem)` and allow long text to wrap.

Dialogs preserve viewport constraints and internal scrolling, commonly `max-height: calc(100dvh - 2rem)`, with existing narrower variations. Ranking remains a full-viewport native dialog. The share-report artifact deliberately keeps a fixed (360px × 640px) composition rather than inheriting a responsive page layout.

## Elevation & Depth

Ordinary shared UI is flat, using panel fills, fine lines and selected tints. Homepage utilities explicitly remove shadows. Modal overlays use existing dimmed black backdrops and blur to distinguish the active layer; these are functional depth rather than a new card-shadow vocabulary. A small incumbent admin-gate shadow remains in source, but that gate is not covered by real protected-route acceptance.

**The Flat Frame Rule.** Use borders and tonal surfaces for ordinary UI depth; do not reintroduce decorative gradient or glow chrome. Existing game feedback and content animation remain explicit exceptions.

There is no decorative homepage motion. Existing quiz reveal/pop/shake, taunt popup and meme motion, toast entry, challenge alarm and other game-state keyframes remain defined; their exact timings are in the sidecar. Some legacy animation definitions remain available even where flat UI removed their prior use. Do not interpret every definition as an active pattern on every page. Existing `prefers-reduced-motion` rules disable the named game animations. State transitions and pressed feedback remain where source components already use them.

## Shapes

The utility radius is (8px), ordinary panel/action radius (12px), and dialog/large surface radius (16px). Tailwind `rounded-xl`, `rounded-2xl`, `rounded-3xl` are intentionally remapped to these values. Reading blocks use the equivalent (1rem) radius. Preserve circles and full pills for avatars, status and badges; these are meaningful exceptions rather than reasons to round every container into a pill.

Homepage entry markers remain circular (22px), with a casual orange ring (6px) or a neutral stroke (1.5px). The image caption keeps its tighter radius. Actual image/crop geometry and original meme illustrations are content constraints.

## Components

### Buttons

General primary buttons use the accent variables, white text and a darker hover when enabled. Disabled states preserve each component's existing opacity/cursor and waiting copy. Bordered and underlined secondary actions remain quiet. Homepage start is a full-width link without an arrow; its styling remains local.

Global keyboard focus uses a plum outline (2px) with offset (4px); homepage links/buttons use their stronger local outline (3px). Forms and plan choices retain explicit focus-border or focus-within variants. Never remove an existing focus treatment to make samples uniform.

### Cards / Containers

Shared panels use semantic panel fill, line border and the panel radius. Selected plans, ranking rows and quote/status containers use the selected tint with appropriate accent emphasis. Homepage mode links remain flat bordered direct entries; PK uses a button in the same presentation. Neutral mode hover and casual warm hover remain homepage-specific.

### Inputs / Fields

Text fields use light/dark panel surfaces, fine lines, normal text weight and comfortable line height. Common text/email/password fields use minimum/explicit height (44px), horizontal padding (12px), and the utility radius. Labels, placeholder contrast, associated errors and pending state remain part of the actual form. The creator's file picker and crop tools retain their existing specialized controls and geometry.

### Chips / Status

Streak badges use compact bordered panel styling and tabular numbers. Administration status chips retain genuine workflow/semantic colors. VIP plans are actual radio controls with selected borders and consent requirements; homepage decorative markers are not radio controls.

### Navigation

Keep brand, return links and all existing destinations. Homepage footer/creation links use underline hover. Account, language, leaderboard and creation controls remain available. Reading pages use clear return navigation and ordinary text hierarchy rather than promotional hero treatment.

### Dialogs and Reports

Leaderboard, VIP, advertisements, profile, result and report dialogs use the same neutral frame, preserving native/shared focus and dismissal logic, real copy, callback and consent behavior. Ranking uses real content when available. Interface consistency does not prove payment or third-party advertisement delivery.

The report-image card uses the shared type and palette, retains its original artwork/content and exports with the canonical host from `seo.siteUrl`. The export check passed. No new raster asset was added in this site-wide extension.

### Illustrative Close-up

`public/images/lobby-leather.webp` is the existing generated homepage illustration, with provenance in its adjacent `.webp.json` file. Keep its localized illustrative label and descriptive alternative text. It demonstrates the guessing mechanic rather than representing a verified playable question. Actual gameplay/meme illustrations remain original game content.

### Review and operating limits

The local finish record reports (36) unit tests, (54) existing browser tests and (5) additional visual-state checks passed, along with focused report/admin checks, typecheck and production build. Existing lint baseline remains (21 errors, 16 warnings), with no additional rule counts. The reviewer inspected (40) captures; (22) regular desktop/mobile route visits had no horizontal overflow. These are evidence bounds, not a claim that every state or language was covered.

Regular `/admin` intentionally returns 404 without `ADMIN_SECRET`; its captures do not validate the protected gate. The real AdminBoard editor was rendered with synthetic props for presentation and keyboard checks, without real privileged writes. Fixture green question rectangles and white admin samples are deliberate stub content. Real Google login, payment, publication, live matchmaking and privileged administration were not exercised. Physical devices, Mobile Safari and screen readers remain unverified; English/Arabic browser cases do not certify all locales or full accessibility. No commit, push or deployment was performed for this extension.

## Do's and Don'ts

### Do:

- Do use root semantic variables so panel, line, muted and selected surfaces adapt together in dark mode.
- Do preserve the approved homepage composition and light palette while adapting other pages to their tasks.
- Do preserve keyboard focus, modal focus behavior, localized labels, RTL handling and the signed-out play path.
- Do keep genuine verdict colors and original question/meme artwork separate from neutral interface chrome.
- Do retain the homepage illustrative label, raster provenance and canonical site configuration for share exports.

### Don't:

- Don't turn every tool or reading page into a homepage hero.
- Don't replace semantic errors or verdicts with the orange brand action color.
- Don't turn homepage decorative entry markers into a radio selection interaction.
- Don't add decorative gradients, glows or animation to ordinary panels; keep the homepage CTA free of an arrow.
- Don't present fixture screenshots, a synthetic admin editor or local visual review as proof of real login, payment, publication, matchmaking or privileged writes.
