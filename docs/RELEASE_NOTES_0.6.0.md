# TSTerm 0.6.0

A complete interface rebuild for TSTerm.

## A new console

The workspace now uses the **Signal** design system: warm carbon surfaces, precise
hairlines, Geist typography, and a single lime signal accent reserved for live
state, selection, and focus. Every screen was rebuilt around the terminal instead
of around dashboard cards.

- New top bar with a centred workspace search, compact live-session counter, and
  quieter actions.
- New device sidebar with a single clear connection action, calmer host rows, and
  monospace metadata.
- Flat tabs with a lime active rail, a framed terminal surface, and a compact
  session toolbar that keeps the session name visible on narrow windows.
- New welcome screen built around a signal monitor: device packs, runbooks,
  platform families, saved devices, and recent connections at a glance.
- New status bar and toast treatment.

## Three themes

- **Carbon** — the default warm-black console with signal lime.
- **Copper** — warm charcoal with a copper signal accent.
- **Paper** — a warm light surface with olive ink.

All three share the same spacing, type, and component rules. The terminal palette
is still independent, and the default TSTerm terminal theme now matches the new
cursor and selection colours.

## Assist and command reference

- The Assist panel now states its device scope once: `Cisco ASA runbooks only —
  other device packs are ignored.`
- Grounding summaries use the active device name everywhere. A Windows session no
  longer reports an ASA catalog.
- The command reference opens with device-specific quick searches, an accurate
  scope message, and a footer that no longer shows global command counts as if
  they belonged to the active device.
- Snippet, settings, debug, palette, and host dialogs follow the new surface,
  radius, and type rules.

## Safety is unchanged

The assistant still has no terminal access, cannot press Enter, only fills verified
commands, and keeps strict ASA grounding. The debug guard still tracks captures and
debugs per session and offers cleanup on exit.

## Verification

- Typecheck passed.
- 110 unit tests passed; 4 opt-in tests skipped.
- AI smoke, per-terminal AI thread smoke, command-browser smoke, and command-AI
  routing smoke passed.
- Packaged 0.6.0 smoke passed.
- Live OpenCode Go model discovery and chat verified in the installed app.

## Install

Download `TSTerm Setup 0.6.0.exe` and run it. Existing hosts, snippets, packs,
settings, and saved API keys are preserved. The UI font is migrated from the old
Inter stack to the bundled Geist family; a custom font choice is left untouched.
