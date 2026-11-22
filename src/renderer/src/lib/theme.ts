import type { ITheme } from '@xterm/xterm'
import type { TerminalTheme } from '@shared/types'

export function toXtermTheme(theme: TerminalTheme): ITheme {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    cursorAccent: theme.cursorAccent,
    selectionBackground: theme.selectionBackground,
    selectionInactiveBackground: theme.selectionBackground,
    black: theme.black,
    red: theme.red,
    green: theme.green,
    yellow: theme.yellow,
    blue: theme.blue,
    magenta: theme.magenta,
    cyan: theme.cyan,
    white: theme.white,
    brightBlack: theme.brightBlack,
    brightRed: theme.brightRed,
    brightGreen: theme.brightGreen,
    brightYellow: theme.brightYellow,
    brightBlue: theme.brightBlue,
    brightMagenta: theme.brightMagenta,
    brightCyan: theme.brightCyan,
    brightWhite: theme.brightWhite
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '').trim()
  if (value.length === 3) {
    const [r, g, b] = value.split('').map((char) => parseInt(char + char, 16))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  if (value.length === 6) {
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return `rgba(220, 232, 244, ${alpha})`
}

export function ghostColor(theme: TerminalTheme, opacity: number): string {
  return hexToRgba(theme.foreground, opacity)
}

export function isLightTheme(theme: TerminalTheme): boolean {
  return !theme.dark
}
