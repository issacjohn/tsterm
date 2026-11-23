# Testing TSTerm

## Fast checks

```bash
npm run typecheck
npm test
npm run build
```

This covers:

- Catalog parsing, validation, inheritance, search, and cleanup requirements.
- Runbook rendering with conditional steps.
- Inline next-word suggestions and prompt stripping.
- The daily GitHub update check, including throttling and failure messages.
- The Electron main/preload/renderer type boundaries.

## Unit tests

`npm test` runs Vitest against `tests/`. The tests do not connect to any device and do not require
credentials.

## UI smoke test

The UI test drives the packaged Electron renderer with Playwright. It creates a temporary profile under the
OS temp folder, so your real hosts and settings are not touched.

```bash
TSTERM_TEST_HOST=192.0.2.10 \
TSTERM_TEST_USER=admin \
TSTERM_TEST_PASSWORD=secret \
npm run test:ui
```

On PowerShell:

```powershell
$env:TSTERM_TEST_HOST = '192.0.2.10'
$env:TSTERM_TEST_USER = 'admin'
$env:TSTERM_TEST_PASSWORD = 'secret'
npm run test:ui
```

The smoke test:

1. Opens the welcome screen.
2. Adds an SSH host and captures the new-host and host-key dialogs.
3. Chooses the device type and connects.
4. Types `deb`, verifies the ghost suggestion, accepts it with Tab, and cancels the line.
5. Runs `show version`.
6. Searches the runbook library for RADIUS, opens a runbook, and tracks a copied debug runbook.
7. Opens the debug guard and the quit guard.
8. Verifies the device type and host key are remembered on a second connection.
9. Creates a snippet and a custom device pack.
10. Switches themes and changes the terminal font.
11. Opens the command palette and the port-forwarding dialog.
12. Opens a local PowerShell session.

Screenshots are written to `screenshots/`.

## Live debug cleanup test

This test is intentionally separate because it starts a real debug on a test device. It:

1. Connects to the device.
2. Sends the RADIUS debug runbook.
3. Confirms `show debug` shows the RADIUS debugs.
4. Calls `window.close()`, confirms the guard prompt, and chooses **Stop debugs & quit**.
5. Reconnects and verifies `show debug` is clean.
6. Checks the cleanup file exists in the temporary profile's `exports/` folder.

```bash
TSTERM_TEST_HOST=192.0.2.10 \
TSTERM_TEST_USER=admin \
TSTERM_TEST_PASSWORD=secret \
node scripts/ui-debug-close.mjs
```

Only run this against a device you own or a lab device you are authorized to change. The test leaves the
device in the same debug state it found (clean).

## Update and packaged-app checks

```bash
npm run test:update
npm run test:packaged
```

`test:update` calls the live GitHub release feed from inside the app and confirms the installed version is
reported correctly. `test:packaged` launches `release/win-unpacked/TSTerm.exe` and verifies the local
PowerShell session, so it should be run after `npm run package`.

## Manual lab notes

The current release was verified on a Cisco ASA Software 9.24(10) appliance with:

- `terminal pager 0`, `terminal monitor`, and `terminal no monitor`.
- `show version | include Version`, `show aaa-server`, `show vpn-sessiondb summary`,
  `show crypto ikev2 sa`, `show crypto ipsec sa`, `show failover`, `show interface ip brief`,
  `show capture`, `show asp drop`, `show cpu usage`, `show memory`, `show conn count`,
  `show monitor-interface`, `show dhcpd binding`, `show route`.
- `debug radius all` / `undebug radius all` and `debug radius user NAME` / `undebug radius user NAME`.
- A `capture TSTCAP interface inside match ip host ... host ...` capture and its `no capture TSTCAP`
  cleanup.

The ASA pack was corrected after testing: it uses `terminal monitor` / `terminal no monitor`, not
`logging console` (which is not available in that form). The ASA capture buffer is now set after creation
(`capture TSTCAP buffer 33554432`), ACL captures use `capture ... access-list TSTCAP_ACL`, ACL cleanup uses
`clear configure access-list TSTCAP_ACL`, and debug cleanup uses the tested `undebug` form.

The ASA pack currently contains 77 runbooks across 14 categories; the full catalog contains 236 runbooks.


## Test credentials

Never commit credentials. The test scripts read `TSTERM_TEST_HOST`, `TSTERM_TEST_USER`, and
`TSTERM_TEST_PASSWORD` from the environment. Screenshots are taken of the app window only and do not
contain the password.
