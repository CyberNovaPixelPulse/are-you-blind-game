---
name: "AreYouBlind — C2 Meme Poster"
description: "Live site-wide C2 visual system: yellow ground, black ink, red actions, square corners and hard offset shadows. Light only."
colors:
  ground: "#ffe14d"
  ink: "#111111"
  muted: "#3d3a33"
  panel: "#ffffff"
  line: "#111111"
  primary: "#c4260f"
  primary-hover: "#9c1d0b"
  selected: "#fff3b0"
  selection-bg: "#111111"
  selection-ink: "#ffe14d"
  focus: "#111111"
  zinc-950: "#111111"
  zinc-900: "#1f1f1f"
  zinc-800: "#2e2e2e"
  zinc-700: "#3d3d3d"
  zinc-600: "#4a4a4a"
  zinc-500: "#5a5a5a"
  zinc-400: "#8a8a8a"
  zinc-300: "#b3b3b3"
  zinc-200: "#d6d6d6"
  zinc-100: "#f3eedc"
  zinc-50: "#fffbe6"
typography:
  display:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "clamp(48px, 6vw, 84px)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  numeral:
    fontFamily: "Anton, Noto Sans TC, sans-serif"
    fontWeight: 400
  title:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "19px"
    fontWeight: 900
    lineHeight: 1.3
  body:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontFamily: "Noto Sans TC, Geist, sans-serif"
    fontSize: "13px"
    fontWeight: 900
    letterSpacing: "0.08em"
rounded:
  default: "0px"
  pill: "9999px"
borders:
  hairline: "2px"
  standard: "3px"
  heavy: "4px"
shadows:
  standard: "4px 4px 0 #111111"
  large: "6px 6px 0 #111111"
  pressed: "2px 2px 0 #111111"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    border: "3px solid {colors.ink}"
    shadow: "{shadows.standard}"
    rounded: "{rounded.default}"
  panel:
    backgroundColor: "{colors.panel}"
    border: "3px solid {colors.line}"
    shadow: "{shadows.standard}"
    rounded: "{rounded.default}"
  dialog:
    backgroundColor: "{colors.panel}"
    border: "4px solid {colors.line}"
    shadow: "{shadows.large}"
    rounded: "{rounded.default}"
  field:
    backgroundColor: "{colors.panel}"
    border: "3px solid {colors.ink}"
    height: "44px"
---

# Design System: AreYouBlind — C2 Meme Poster

## Overview

**Creative North Star: "The Meme Poster"**

C2 is the visual system that went live in commit `0928284` (*Restyle site with C2 meme-poster theme*). It was picked from a canvas exploration of several directions: the original lavender "Quiz Station" (B), arcade, detective file, newspaper, receipt and chat-room. C2 was chosen because its loud, sticker-like tone matches the product's irreverent "你瞎了嗎？" voice and the roast that follows a wrong answer.

The system is a yellow ground with black ink, one red action colour, square corners, thick black borders and hard offset shadows. Real question images, meme roasts and scoring feedback are content. They sit inside the poster frame and are never repainted to match it.

**Key characteristics:**

- Yellow ground (`#ffe14d`), near-black ink (`#111111`), red primary action (`#c4260f`).
- Square corners everywhere except deliberate pills and circles.
- Thick black borders (2–4px) and hard, unblurred offset shadows instead of soft elevation.
- Only the hero photo and the circular sticker tilt. Text, controls and cards stay straight so they remain easy to scan.
- **Light only.** Dark mode is switched off for now (see Colors › Dark mode).

## Colors

### Root variables

`src/app/globals.css` `:root` is authoritative:

| Variable | Value | Role |
| --- | --- | --- |
| `--background` | `#ffe14d` | Page ground |
| `--foreground` | `#111111` | Ink |
| `--game-panel` | `#ffffff` | Cards, fields, answer buttons |
| `--game-line` | `#111111` | Borders |
| `--game-muted` | `#3d3a33` | Secondary text |
| `--game-accent` | `#c4260f` | Primary action |
| `--game-accent-hover` | `#9c1d0b` | Primary hover |
| `--game-selected` | `#fff3b0` | Selected and hover tint |
| `--c2-ink` | `#111111` | Border and shadow ink |
| `--c2-shadow` / `--c2-shadow-lg` | `4px 4px 0` / `6px 6px 0` | Hard offset shadows |

The Tailwind `zinc-*` names are remapped in `@theme inline` to a neutral warm-grey scale (see frontmatter). They exist for compatibility with existing utility classes; they are not a second palette. Use the root variables for new work.

### Contrast

Approximate ratios:

- Ink on yellow: about 14:1.
- Muted `#3d3a33` on yellow: about 8:1.
- White on primary red: about 6:1.
- Yellow on ink, used for inverted chips and the brand block: about 14:1.

Do not use mid-greys lighter than `zinc-500` for text on the yellow ground.

### Semantic colors

Tailwind red, emerald and amber keep their meaning for errors, correct answers and warnings. The red primary action is a brand colour, not a verdict. Verdict blocks keep their own darker red and emerald fills.

**The Semantic Feedback Rule.** Red and green stay reserved for genuine verdicts and errors, so they never carry decoration.

### Dark mode

`@custom-variant dark (&:where(.dark, .dark *));` turns every existing `dark:` utility (about 218 of them) into a no-op, because nothing sets `.dark`. The `prefers-color-scheme: dark` token block was removed, and both `theme-color` entries in `layout.tsx` are `#ffe14d`.

A dark variant of C2 still needs to be designed. The canvas's black-and-yellow challenge screen is a starting point. Until that exists, do not re-enable media-based dark mode: the leftover `dark:` utilities were written for the lavender palette and would clash.

## Typography

- **Sans:** Noto Sans TC (`--font-game-sans`), with Geist and sans-serif fallbacks. It is loaded once in the root layout via `next/font/google`.
- **Display numerals:** Anton (`--font-c2-display`, exposed as `--font-display`). It is used for the brand block, mode numbers (01–04), arrows in the how-to strip, and large numeric readouts. It covers Latin only, so never set CJK copy in it.

### Hierarchy

- **Display:** The lobby `h1` (the localized title followed by a red "！") at `clamp(48px, 6vw, 84px)`, weight 900, line height 1.02, letter spacing -0.04em. Below 900px it is `clamp(44px, 13vw, 60px)`.
- **Page headings:** `.gm-page h1` is weight 900 with letter spacing -0.03em. Sizes stay whatever each page already set.
- **Title:** Mode cards use 19px / 900, dropping to 17px at 430px and below.
- **Body:** 13–14px. Answers keep their existing 16px reading size.
- **Label:** Section labels such as 「其他玩法」 use 13px / 900 with 0.08em tracking. Badges use 11px / 900 on an ink background.
- Numbers use tabular figures wherever scores, timers or ranks change.

## Layout

### Lobby (`src/components/game-lobby.tsx`, `game-lobby.module.css`)

- **Shell:** `min(100% - 6rem, 1200px)`, which becomes `min(100% - 36px, 620px)` below 900px.
- **Desktop:** a two-column grid of `1.05fr / 1fr`. The left column holds the title, tagline, how-to strip and tilted photo; the right column holds the start button, the 2×2 mode cards, create and coming-soon, and the honor card.
- **Mobile:** a single column in that same order.
- **How-to strip:** three bordered chips (看特寫 → 四選一 → 猜錯被嘲). The last chip is inverted. The arrows flip direction for RTL.
- **Sticker:** a red circle reading 「這是什麼？」, rotated 12°. It is 124px wide on desktop and 100px on mobile.
- **Start button:** height 68px (64px on mobile) with a 4px border and a 6px shadow. It is the single loudest element on the page.
- **Mode cards:** numbered 01–04 by a CSS counter on `.marker::before`, so `PkEntry` needs no extra prop. 「每日更新」 is an inline badge inside the daily card's heading.
- **Localized copy:** the how-to strip, sticker and 「其他玩法」 label come from a lobby-local `LOBBY_COPY` table that only covers zh-TW, zh-CN and en. Other languages skip these elements instead of falling back to English. Adding more languages is a follow-up.

### Games, tools and reading

Pages keep their existing structure and inherit C2 through the shared theme:

- At 900px and wider, question stages keep the `1.12fr / 1fr` image-and-answers grid.
- Forms keep 44px fields.
- Reading pages keep their 75ch measure.

The canvas also designed a black-ground challenge screen, but **it is not implemented**. `/challenge` currently uses the same yellow ground as everything else.

## Elevation & Depth

Depth comes from hard, unblurred offset shadows in ink, never from soft blur or glow:

- `4px 4px 0`: buttons, panels and answer buttons.
- `6px 6px 0`: dialogs, the start button and the hero photo.
- `8px 8px 0`: the lobby photo only.

Pressed state translates the element 2–3px toward its shadow and shrinks the shadow to match. Under `prefers-reduced-motion`, tilts and press transitions are removed.

**The Hard Shadow Rule.** One shadow direction (down-right) and one colour (ink). Do not mix in blurred or coloured shadows.

## Shapes

- `--radius-lg`, `--radius-xl`, `--radius-2xl` and `--radius-3xl` are all `0px`, so existing `rounded-lg` through `rounded-3xl` utilities render square.
- `rounded-full` is kept for avatars, pills and the sticker.
- `rounded-md` and `rounded-sm` keep Tailwind defaults. Avoid them in new work.

## Components

### Shared rules (`globals.css`)

**Primary actions**

- `:is(button, a).bg-game-accent` and `.game-action` get a 3px ink border, the standard shadow, weight 900 and a pressed transform.
- These rules are unlayered on purpose, so they win over Tailwind utilities.

**Panels and dialogs**

- `.game-panel` has a 3px border and the standard shadow.
- `.game-dialog` has a 4px border and the large shadow.

**Inside `.gm-page`**

- `.border` is bumped to 2px.
- Text inputs, textareas and selects get a 3px ink border.
- `h1` is weight 900.

**Question stage**

- `.game-question-image` has a 4px border, the large shadow and a -1.5° tilt.
- `.game-question-answers button.border` has a 3px ink border, the standard shadow and weight 900.

**Focus:** a 3px solid ink outline with a 4px offset, globally and in the lobby.

**Selection:** ink background with yellow text.

### Lobby utilities

The language switcher and account buttons are white with a 3px ink border and no shadow. The honor card sits in a white bordered box. It still reads `--lobby-muted` and `--lobby-line`, which the lobby module redefines to C2 values.

### Illustrative close-up

`public/images/lobby-leather.webp` is a generated sample image. Its provenance is recorded in the adjacent `.webp.json`. It keeps the localized 「示意題圖」 label and descriptive alt text, and it illustrates the mechanic rather than representing a playable question.

## Review status and limits

**Verified before release:**

- Typecheck, lint on the changed files, 36 unit tests and a production build all passed.
- Locally, the lobby was viewed at 375px and 1280px. Play, challenge, create and PK were viewed at 375px.
- After deploy, the live lobby was checked at 375px.

**Not yet checked under C2:**

- Admin and the dialogs (leaderboard, VIP, ads).
- The share-report card and the wrong-answer taunt overlay.
- Answered and verdict states. No answers were submitted, because the local environment may point at production data.
- RTL languages and screen readers.

Treat these as open risks, not as verified.

## Do's and Don'ts

### Do

- Do use the root variables and the shared rules above, so pages pick up C2 without per-page restyling.
- Do keep exactly one loud primary action per screen, using the red button with a heavy border and shadow.
- Do keep tilt for the hero image and stickers only. Controls and text stay straight.
- Do keep real verdict colours, question images and meme art as content inside the frame.
- Do keep visible focus, localized labels, RTL handling and the signed-out play path.

### Don't

- Don't re-enable `prefers-color-scheme` dark mode until a C2 dark palette exists.
- Don't add rounded corners, soft or blurred shadows, gradients or glows.
- Don't use Anton for CJK text or long copy.
- Don't use the brand red for errors, or emerald for decoration.
- Don't treat local or fixture screenshots as proof of real login, payment, publication, matchmaking or admin writes.
