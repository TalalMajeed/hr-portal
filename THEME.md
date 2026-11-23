# DU Job Portal theme

The portal follows the Daanish University website (https://www.du.edu.pk), so it reads as part of DU. Values below were read from that site's live CSS on November 23, 2026. Use these tokens; don't invent new colours or sizes.

## Logo

- File: `portal/public/du-logo.png` (1057 × 367, transparent PNG, black artwork: Urdu wordmark above "Daanish University").
- Use it in the header at about 36 to 40 px tall, left-aligned, linking to the home page. Alt text: "Daanish University".
- Black artwork only works on light backgrounds. On the dark teal footer, use the text name "Daanish University" (or a white version of the logo if DU supplies one); never recolour the PNG with CSS filters on a busy background.

## Colours

DU's palette is teal on white with a sand accent.

| Token              | Value     | Use                                                        |
| ------------------ | --------- | ---------------------------------------------------------- |
| `du-teal`          | `#008080` | Primary: buttons, links, active nav, focus ring            |
| `du-teal-dark`     | `#005C5C` | Hover on primary, footer and hero bands, accent text       |
| `du-tint`          | `#E8F3F3` | Alternate section background, selected or hover fill       |
| `du-off`           | `#F8FAFA` | Muted surfaces (table stripes, page background behind cards) |
| `du-sand`          | `#D4A24C` | Secondary accent, sparingly (badges, chart series)         |
| `du-text`          | `#1F2933` | Body and heading text                                      |
| `muted-foreground` | `#4B5563` | Secondary text, captions, helper text                      |
| `border`           | `#D5E3E3` | Card, input and divider borders                            |
| header border      | `#E5EEEE` | Hairline under the sticky header                           |
| `background`       | `#FFFFFF` | Page and card background                                   |
| `destructive`      | `oklch(57.7% 0.245 27.325)` (≈ `#E7000B`) | Errors and destructive actions |

Contrast (WCAG): `#008080` on white is 4.77:1 and white on `#008080` is the same, so teal passes AA for normal text. `#005C5C` on white is 7.8:1, `#1F2933` is 14.8:1, `#4B5563` is 7.6:1, and the status colours below are all 4.7:1 or more. `#D4A24C` on white is only 2.3:1: never use sand for text on white.

Status colours (not on the DU site; chosen for the portal):

| Status  | Value     | Use                                         |
| ------- | --------- | ------------------------------------------- |
| Success | `#15803D` | Selected, approved, submitted               |
| Warning | `#B45309` | Pending, closing soon, reschedule requested |
| Danger  | destructive token | Rejected, not met, overdue          |
| Info    | `#008080` | Neutral states (Under review, Scheduled)    |

Each status (and teal and sand) has a pale tint for badge and notice backgrounds and a slightly darker line for their borders, defined as `--du-<status>-tint` and `--du-<status>-line` in `portal/src/app/globals.css`.

Pair every status colour with a word; colour is never the only signal.

The DU site has no dark theme, so the portal is light only for now.

## Typography

Both fonts are on Google Fonts. In Next.js load them with `next/font/google`.

| Role              | Font                                        | Weights            |
| ----------------- | ------------------------------------------- | ------------------ |
| Display, headings | Playfair Display (serif), fallback Georgia  | 500, 600, 700, italic 500 |
| Body and UI       | Inter, fallback `ui-sans-serif, system-ui`  | 400, 500, 600, 700 |

Type scale as used on the site:

| Element            | Font     | Size / line height | Weight | Tracking  |
| ------------------ | -------- | ------------------ | ------ | --------- |
| Hero title (H1)    | Playfair | 60 / 75 px (36 px on phones) | 600 | -1.5 px (`tracking-tight`) |
| Section title (H2) | Playfair | 36 / 40 px (30 px on phones) | 600 | -0.9 px |
| Body               | Inter    | 17 / 28.9 px (line height 1.7) | 400 | normal |
| Lead paragraph     | Inter    | 18 / 30.6 px       | 400    | normal    |
| Nav link, button   | Inter    | 15 / 25.5 px       | 600 to 700 | 0.15 px (0.01em) |
| Kicker (eyebrow)   | Inter    | 12 px, uppercase   | 600    | 0.16em, colour `du-teal` |

Nothing in the portal is smaller than 14 px: no 12 px kickers or captions, even though the DU site uses one. Use 14 px (`text-sm`) for meta text, 15 px for tables and buttons, 16 px for body and inputs.

For the portal's dense admin screens (tables, forms, dashboards), keep Playfair for page titles only and use Inter for everything else, at 14 to 15 px in tables and 16 px in form inputs (iOS zooms below 16). Keep reading text to about 70 characters wide (`du-prose { max-width: 70ch }`).

## Buttons

Square-ish, solid, no shadows. Radius 2 px.

| Variant   | Default                                    | Hover                                  |
| --------- | ------------------------------------------ | -------------------------------------- |
| Primary (`du-btn`) | bg `#008080`, border 1 px `#008080`, text white | bg and border `#005C5C`        |
| Ghost (`du-btn-ghost`) | transparent, border 1 px `#008080`, text `#008080` | bg `#008080`, text white |
| Outline on dark (`du-btn-outline`) | transparent, border 1 px white, text white | bg white, text `#005C5C` |

Shared: Inter 15 px, weight 600, letter spacing 0.01em, padding 0.85 rem × 1.6 rem (about 48 px tall), `inline-flex` centred with 0.5 rem gap for an icon. Press: `transform: scale(0.97)`. Transition 160 ms on background, border and transform, easing `cubic-bezier(0.23, 1, 0.32, 1)`.

For compact controls inside tables and toolbars, use the same colours at 36 px tall (padding 0.5 rem × 1 rem, 14 px text).

Icon buttons: 40 × 40 px, icon in `#008080`; on dark bands a round 40 px button with a 1 px `white/25` border that fills white with teal-dark icon on hover.

## Cards

`du-card`: white, 1 px `#D5E3E3` border, radius 10 px, padding 24 px.
Hover (only on cards that are links): border turns `#008080`, lifts 3 px, shadow `0 8px 20px -12px rgba(0, 92, 92, 0.28)`, 180 ms with the same easing. Cards that aren't clickable don't move.

## Forms

The site has no forms, so these follow its tokens: inputs 40 px tall, white, 1 px `#D5E3E3` border, radius 4 px (`--radius: 0.25rem`), 16 px Inter text; focus border `#008080` with the focus ring below. Labels 14 px, weight 500, `du-text`. Errors in the destructive colour under the field.

## Focus

Every focusable element: `outline: 2px solid #008080; outline-offset: 3px` on `:focus-visible`. Never remove it.

## Layout

- Header: sticky, white, 1 px `#E5EEEE` bottom border, `shadow-xs` (`0 1px 2px rgba(0,0,0,0.05)`). Logo left, nav right; nav links Inter 15 px bold, `du-text`, active link in `#008080`; padding 8 × 12 px. Collapses to a teal hamburger below 1340 px.
- Footer: `#005C5C` band, white text.
- Sections (`du-section`): 30 px vertical padding, 35 px from 768 px up; alternate white and `#E8F3F3` backgrounds.
- Hero: full-width photo with a dark teal overlay, white Playfair title, white outline button.
- Radius: 2 px buttons, 4 px inputs and small controls, 10 px cards, full round for pills and dots.
- Shadows only on the header and hovered cards. Everything else reads by border.

## Motion

- Easing `cubic-bezier(0.23, 1, 0.32, 1)` for buttons and cards (160 to 180 ms); `cubic-bezier(0.4, 0, 0.2, 1)` at 150 ms for colour changes on links.
- Animate colour, transform and opacity only. Under `prefers-reduced-motion`, drop the lift and press scale.

## Tailwind 4 tokens

Paste into `portal/src/app/globals.css` when the theme is applied:

```css
:root {
  --du-teal: #008080;
  --du-teal-dark: #005c5c;
  --du-tint: #e8f3f3;
  --du-off: #f8fafa;
  --du-sand: #d4a24c;
  --du-text: #1f2933;
  --du-muted: #4b5563;
  --du-border: #d5e3e3;
  --du-destructive: oklch(57.7% 0.245 27.325);
  --radius: 0.25rem;
}

@theme inline {
  --color-du-teal: var(--du-teal);
  --color-du-teal-dark: var(--du-teal-dark);
  --color-du-tint: var(--du-tint);
  --color-du-off: var(--du-off);
  --color-du-sand: var(--du-sand);
  --color-du-text: var(--du-text);
  --color-du-muted: var(--du-muted);
  --color-du-border: var(--du-border);
  --color-destructive: var(--du-destructive);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-serif: var(--font-playfair), ui-serif, Georgia, serif;
}
```
