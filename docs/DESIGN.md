# TSTerm — Signal design system

TSTerm is a network operations instrument, not a dashboard. The interface is built
to feel like a well-kept field console: warm carbon surfaces, precise hairlines,
monospace annotations, and one signal colour that only appears when something is
live, selected, or focused.

## Principles

1. **The terminal is the product.** Chrome stays quiet and compresses before the
   terminal does.
2. **One signal accent.** Lime is used for live state, selection, and focus. It is
   not decoration. Warnings use amber; failures use red.
3. **Hairlines before shadows.** Structure comes from 1px borders, surface steps,
   and spacing. Shadows are reserved for modal layers.
4. **Mono for machines.** Hosts, commands, versions, counts, and keyboard hints use
   `Geist Mono`. Human copy uses `Geist`.
5. **Scope is visible.** Device type and device-scoped runbooks are stated once in
   the workspace, not repeated on every row.
6. **Readable density.** The UI is dense, but no text is intentionally ornamental.
   Metadata never drops below 8px; body copy targets 11–13px.

## Colour

### Carbon (default, `data-app-theme="midnight"`)

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#080907` | Canvas |
| `--panel` | `#0e100d` | Shell surfaces |
| `--panel-2` | `#141712` | Raised rows and controls |
| `--border` | `#20251d` | Hairlines |
| `--text` | `#eef0e8` | Primary text |
| `--muted` | `#99a291` | Secondary text |
| `--faint` | `#737c6c` | Metadata |
| `--accent` | `#c9f45a` | Signal lime: live, focus, selection |
| `--amber` | `#e8b968` | Caution and debug state |
| `--danger` | `#f07361` | Failure and destructive state |

### Copper (`graphite`) and Paper (`daylight`)

Copper is a warm charcoal with a copper signal accent. Paper is a warm light
surface with olive ink. Theme IDs stay stable for saved settings; only the names
and values changed.

## Typography

- **UI:** Geist Variable, bundled with the app. Fallback: Segoe UI Variable.
- **Code and metadata:** Geist Mono Variable, bundled with the app.
- **Display:** 34–53px, weight 560, tracking `-0.055em`, maximum two lines.
- **Labels:** mono, 7.5–9px, uppercase, tracking `0.08–0.13em`.
- **Body:** 11–13.5px, line-height 1.5–1.7.

## Layout

- Top bar 56px, workspace flexible, status bar 26px.
- Sidebar defaults to a single device index; the quick action and search stay at
  the top, tools stay at the bottom.
- Tabs are flat strips. The active tab is marked by a 2px lime rail on the left.
- The terminal is a framed slab with an 8px gutter from the workspace edge.
- Assist is a fixed-width working panel, not a floating inspector.
- Welcome uses an asymmetric split: copy and actions left; a signal monitor right.
  The monitor is decorative and is removed below 1120px.
- Never place cards inside cards inside cards. Use section rules and spacing.

## Components

- **Buttons:** 7px radius; primary uses the signal fill and dark ink; secondary is
  a hairline outline on transparent. Active state moves 1px, never changes layout.
- **Rows:** 7–9px vertical padding; hover/selection is a surface step, not a shadow.
- **Inputs:** 6px radius, 34px tall, mono label above the field, accent focus ring
  at 13% opacity.
- **Tabs:** flat, 38px tall, no pills; active is a lime inset rail.
- **Modals:** 10px radius, solid backdrop, hairline border, no decorative gradients.
- **Empty states:** state the scope, explain the next action, and offer 2–4 quick
  starts. No dead ends.
- **Status dots:** square-ish 5–6px marks, not glowing orbs.

## Motion

- One entrance: the signal monitor fades up 8px and its trace draws once (≈1.3s).
- Hover and focus transitions: 120–160ms, `cubic-bezier(0.22, 1, 0.36, 1)`.
- The only infinite animations are the terminal caret and the live signal pulse.
- All non-essential motion is disabled under `prefers-reduced-motion`.

## Accessibility

- All interactive controls have a visible accent focus ring.
- Icon-only controls have `aria-label` and a tooltip title.
- Accent is never the only signal: verified, warning, and failure states also carry
  an icon and text.
- Text contrast targets 4.5:1 for normal text in all three themes.
- Status is never communicated by colour alone.

## Anti-patterns

No neon glows, no purple gradients, no emoji icons, no floating cards over the
terminal, no 3-column marketing cards, no generic dashboard cards, no nested
elevation, no purely decorative animation, and no hardcoded ASA labels in a
Windows session.
