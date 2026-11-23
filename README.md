# TSTerm

**A troubleshooting console for the device in front of you.**

TSTerm is a desktop terminal for network and system engineers. It remembers what kind of device a host is,
turns a protocol into a safe, complete runbook, and makes sure the debugs and packet captures you start are
cleaned up before you walk away.

It is built for the messy middle of an incident: the part where you know *what* is wrong but still need the
exact ASA, IOS-XE, NX-OS, PAN-OS, PowerShell, or shell command that gets you the next piece of evidence.

![TSTerm welcome](screenshots/01-welcome.png)

## Why it exists

Most troubleshooting tools stop at “here is a command.” TSTerm goes the rest of the way:

- You connect once and **TSTerm remembers the device type** for that host.
- You type `deb` and a **dim next-word prediction** appears inline. Press `Tab` to accept it.
- You choose a symptom, fill in one or two filters, and get a **runbook with verify and cleanup**.
- If you leave a debug or capture running, TSTerm **asks before quitting** and sends the cleanup to every
  live session. If a device is already disconnected, it copies the cleanup and writes a file you can use later.

No browser tabs full of half-remembered commands. No forgotten `undebug all` at 02:00.

## What is inside

### A terminal built for troubleshooting

- Real SSH sessions and a local shell (PowerShell on Windows, `$SHELL` on macOS/Linux).
- Tabs and split panes.
- Multiple terminal themes, live font changes, font size/line height/spacing, cursor styles, scrollback.
- Copy on select, right-click copy/paste, clickable links, Ctrl+F search, and font zoom.
- SFTP browser, local port forwarding, jump hosts, session logs, known-host pinning, and encrypted credentials.
- Session logging and a configurable keepalive.

### Device-aware runbooks

The bundled catalog contains **13 device packs and 236 runbooks**, covering:

| Platform | What is covered |
| --- | --- |
| Cisco ASA | **77 runbooks** — VPN, AnyConnect, IKEv1/IKEv2/IPsec, RADIUS/TACACS+/LDAP/User-ID, captures (host, subnet, ACL, ASP drop, decrypted), NAT, OSPF/EIGRP/BGP/multicast/IPv6, failover and clustering, licenses, logging, threat detection, and more |
| Cisco IOS / IOS-XE | EPC captures, BGP/OSPF/EIGRP, RADIUS/TACACS+, IPsec/DMVPN, NAT, STP, multicast, health |
| Cisco Nexus | Ethanalyzer, vPC, port-channels/LACP, BGP/OSPF, AAA, FEX, STP, multicast, NAT |
| Cisco FTD | FMC capture, diagnostic CLI, packet-tracer, connections, VPN, AAA, deployment, expert mode |
| Cisco FMC | Health, disk, deployment tasks, registration, backups, licensing, updates, time |
| Cisco AireOS WLC | Clients, AAA/RADIUS, AP join, CAPWAP, roaming, RF, controller health |
| Catalyst 9800 | Wireless client, RADIUS, AP join, CAPWAP, roaming, RF, WLAN — plus the IOS-XE base set |
| Cisco Meraki | Dashboard workflows and read-only API calls |
| Palo Alto PAN-OS | Packet-diag capture, policy/NAT/fib tests, sessions, VPN, User-ID, counters, HA |
| Windows | PowerShell networking, DNS, pktmon, ports, firewall, VPN, Wi-Fi, proxy, TLS, event logs |
| Linux | iproute2, DNS, tcpdump, sockets, nftables/iptables/firewalld, NetworkManager, bonding, logs |
| macOS | ifconfig/scutil/networksetup, tcpdump, PF, VPN, Wi-Fi, proxy, unified logs, routes |
| Generic network device | A safe starting point for anything not in the library yet |

Every workflow can carry variables, required inputs, validation, instructions, notes, verification steps,
and **cleanup commands**. Debug and capture workflows are not allowed to load without cleanup.

### Inline next-word predictions

![Inline prediction](screenshots/06-suggestions.png)

As you type, TSTerm shows a dim completion after the cursor — never as bright as what you have typed.
Predictions come from the active device pack, your snippets, and recent commands in the session.
`Tab` accepts, `Esc` dismisses. Password prompts and full-screen programs are excluded.

### The debug guard

![Debug guard](screenshots/12-debug-guard.png)

When you send or copy a debug or capture runbook, the session is tracked. On app close you get a clear
prompt:

- **Stop debugs & quit** — sends cleanup to connected sessions, copies it, and writes a cleanup file.
- **Quit without stopping** — leaves the device as-is; the record survives and is shown next launch.
- **Cancel** — stays in the app.

The guard is a safety net, not a substitute for judgment. If the app is killed or the network fails at the
worst moment, use the copied cleanup file and verify the device state.

### Runbooks you can read before you run

![Runbook preview](screenshots/10-runbook-modal.png)

Commands are shown as a numbered runbook with notes, verification, cleanup, and a state-change
acknowledgement. You can copy commands, copy a documentation runbook, or send them one line at a time to
the active terminal.

### Your own device packs

![Create a device pack](screenshots/16-new-device-type.png)

Create a device type from the UI, import a JSON pack, or extend an existing pack and override only the
workflows you need. The custom catalog lives outside the app bundle, so updates never overwrite it.

See [docs/DEVICE_PACKS.md](docs/DEVICE_PACKS.md) for the format and a full example.

### Updates and support

![Update check](screenshots/20-update-check.png)

TSTerm checks the public GitHub release feed **once a day** on launch. You can also check manually from
Settings → About. If a newer version exists, you can download it, skip that version, or turn automatic
checks off. Nothing is installed without you.

If TSTerm saves you time, there is a small **Buy me a coffee** link in the status bar and in Settings:
[buymeacoffee.com/issac_john](https://buymeacoffee.com/issac_john).

## Install and run

Requirements: **Node.js 22+**, Git, and the usual platform build tools for `node-pty`.

```bash
git clone https://github.com/issacjohn/tsterm.git
cd tsterm
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm start
```

Create a desktop installer:

```bash
npm run dist
```

Artifacts land in `release/`. The first Windows build is unsigned, so SmartScreen may ask you to confirm
before launching it. The installer is built from this source and contains the bundled catalog.

### If npm blocks install scripts

Recent npm versions can hold install scripts until approved. TSTerm needs Electron, esbuild, ssh2, and
node-pty to finish their install scripts. If `npm install` reports them as blocked, approve them and
rebuild:

```bash
npm install-scripts approve electron
npm install-scripts approve esbuild
npm install-scripts approve node-pty
npm install-scripts approve ssh2
npm rebuild
```

On Linux, install build tools first (`build-essential`, `python3`, `make`, `g++`). On macOS, install the
Xcode command line tools.

## First five minutes

1. Click **New SSH connection** and enter the host, username, and password (or choose a private key).
2. Leave the device type as **Ask me on the first connection**. TSTerm asks for the CLI family after the
   first successful login and remembers it.
3. Open the **Troubleshoot** panel on the right and search for a symptom, e.g. `radius debugs`, `packet
   capture`, `bgp`, `dns`, or `pktmon`.
4. Fill in the filter variables and open the runbook. Review the commands and cleanup.
5. Type directly in the terminal when you prefer. Use `Tab` to accept the dim suggestion.

Changing the device type later is easy: click the device chip in the session toolbar, or use the host's
menu → **Set device type**.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New SSH connection | `Ctrl/Cmd + Shift + N` |
| Local terminal | `Ctrl/Cmd + Shift + T` |
| Command palette | `Ctrl/Cmd + Shift + P` |
| Settings | `Ctrl/Cmd + ,` |
| Close tab | `Ctrl/Cmd + Shift + W` |
| Toggle troubleshooting panel | `Ctrl + Shift + K` |
| Debug guard | `Ctrl + Shift + D` |
| Find in terminal | `Ctrl + F` |
| Copy / paste terminal selection | `Ctrl + Shift + C` / `Ctrl + Shift + V` (macOS: `Cmd + C/V`) |
| Accept prediction | `Tab` |
| Font zoom | `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` |
| Quit | `Ctrl + Q` (macOS: `Cmd + Q`) |

The full list is in **Help → Keyboard shortcuts** (`F1`).

## Custom device packs

A device pack is JSON. The minimum is a device type with categories and workflows. A workflow can be a
single command or a multi-step procedure with variables and cleanup.

```json
{
  "id": "my-platform",
  "name": "My platform",
  "vendor": "Acme",
  "family": "Firewall",
  "description": "Troubleshooting pack for Acme OS.",
  "categories": [
    { "id": "connectivity", "name": "Connectivity" }
  ],
  "workflows": [
    {
      "id": "reachability",
      "title": "Reachability check",
      "category": "connectivity",
      "summary": "Ping and trace the target.",
      "keywords": ["ping", "traceroute"],
      "severity": "info",
      "effect": "read",
      "variables": [
        { "name": "dst", "prompt": "Target IP", "type": "ip", "required": true }
      ],
      "steps": ["ping {dst}", "traceroute {dst}"]
    }
  ]
}
```

Use **Settings → Data & packs → New device type** to generate a starter pack, save it, and edit the JSON in
place. Packs are validated before they are loaded. If something is wrong, the app tells you which file and
which field, and keeps the rest of the catalog usable.

The full schema, inheritance rules, variable types, conditions, and cleanup requirements are in
[docs/DEVICE_PACKS.md](docs/DEVICE_PACKS.md). A JSON Schema is available at
[schemas/device-pack.schema.json](schemas/device-pack.schema.json).

## Testing

Unit tests:

```bash
npm test
npm run typecheck
npm run build
```

There are tests for catalog loading and inheritance, runbook rendering, variable validation, the inline
suggestion engine, and the daily GitHub update check.

The UI smoke test drives the real Electron app, creates a host, connects over SSH, checks the device-type
and host-key prompts, verifies the remembered type on a second connection, types a command, exercises
inline suggestions, copies a debug runbook, opens the debug guard, creates a snippet and a device pack,
tests both themes and font changes, exercises the quit guard, and opens a local PowerShell session.

```bash
TSTERM_TEST_HOST=192.0.2.10 \
TSTERM_TEST_USER=admin \
TSTERM_TEST_PASSWORD=secret \
npm run test:ui
```

Two more opt-in tests are included:

```bash
# Starts a real RADIUS debug, quits through the guard, and checks the cleanup with show debug
npm run test:debug-guard

# Checks the live GitHub release feed from the app
npm run test:update

# Launches the packaged Windows build and checks the local shell
npm run test:packaged
```

The debug test is the only one that changes a device, and it restores the debug state before it finishes.
See [docs/TESTING.md](docs/TESTING.md) for the details.

**Lab verification:** the included UI tests and a live debug-cleanup test were run against a
**Cisco ASA Software 9.24(10)** appliance. Confirmed:

- SSH login, first-use host key prompt, and trusted-key reuse.
- Device type selection and memory across a second session.
- `show version`, the runbook panel, and inline `deb` → `debug` prediction.
- Sending a live RADIUS debug runbook, then quitting and verifying `show debug` showed no RADIUS debug
  after cleanup.
- Cleanup file creation in the app data `exports/` folder.
- Local PowerShell, snippets, and custom device pack creation.
- 77 ASA runbooks across 14 categories, including capture-buffer, ACL-capture, and debug cleanup syntax
  corrected against the live device (`capture TSTCAP buffer 33554432`, `clear configure access-list`,
  `undebug`).

Think before you paste. The catalog is a knowledgeable assistant, not a substitute for change control.

## Security and privacy

- Passwords and key passphrases are encrypted with Electron `safeStorage` (Windows DPAPI, macOS Keychain,
  Linux libsecret) when “Remember” is enabled. If OS encryption is unavailable, they stay in memory for
  the session only.
- The app does not run a local HTTP server and does not accept remote connections. Terminal sessions are
  outbound SSH or a local PTY.
- SSH host keys use SHA-256 fingerprints with strict checking by default.
- The only automatic network call is the daily GitHub release check. There is no telemetry, account, or
  cloud sync.
- Session logs and exports are local files. Treat them as sensitive.
- Custom device packs run with the same privileges as the app. Only import packs you trust.

## Current scope and roadmap

TSTerm is intentionally a desktop app with a real terminal engine rather than a wrapper around the system
terminal. It already covers the daily working set: SSH, local shells, tabs, split panes, SFTP, local
forwarding, jump hosts, snippets, themes/fonts, inline prediction, device packs, and the debug guard.

Termius-style features that are not in this release: team vaults and sync, SFTP drag-and-drop, serial and
telnet sessions, dynamic SOCKS/remote port forwarding, key generation, shared sessions, and mobile apps.
The update flow opens the release page; it does not silently install binaries.

## Credits

Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/),
[xterm.js](https://xtermjs.org/), [ssh2](https://github.com/mscdex/ssh2),
[node-pty](https://github.com/microsoft/node-pty), [lucide](https://lucide.dev/), and
[sharp](https://sharp.pixelplumbing.com/).

The logo is an original mark for TSTerm.

## License

MIT. See [LICENSE](LICENSE).

---

If this helps you close an incident a little faster, you can
[buy me a coffee](https://buymeacoffee.com/issac_john). No pressure — the tool is the point.
