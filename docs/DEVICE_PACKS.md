# Device packs

A device pack tells TSTerm what a platform is called, how it should be grouped, and which troubleshooting
runbooks belong to it. Packs are plain JSON. They are validated every time the catalog is loaded.

## Where packs live

| Location | Purpose |
| --- | --- |
| `resources/catalog/*.json` | Bundled packs that ship with the app. |
| `<app data>/catalog/*.json` | Your custom packs. They are never overwritten by an app update. |

You can open the custom folder from **Settings → Data & packs → Open packs folder**.

In the app, use **Settings → Data & packs → New device type** for a starter pack and a JSON editor, or
**Import pack** to bring in a file. After editing a file outside the app, click **Reload catalog** or press
`F5` in the main window. Invalid files are reported with their path and field, and the rest of the catalog
continues to load.

## A complete example

```json
{
  "id": "acme-edge",
  "name": "Acme Edge Firewall",
  "vendor": "Acme",
  "family": "Firewall",
  "description": "Troubleshooting pack for Acme Edge OS 12 and later.",
  "aliases": ["acme", "edge"],
  "notes": ["Run commands from the operational CLI.", "Enable mode is required."],
  "categories": [
    { "id": "capture", "name": "Packet capture" },
    { "id": "connectivity", "name": "Connectivity" },
    { "id": "aaa", "name": "AAA / RADIUS" }
  ],
  "workflows": [
    {
      "id": "capture-host",
      "title": "Packet capture — host pair",
      "category": "capture",
      "summary": "Capture a host-to-host flow and save it for analysis.",
      "keywords": ["capture", "pcap", "sniffer", "host"],
      "tags": ["capture"],
      "severity": "caution",
      "effect": "capture",
      "requires": ["enable mode"],
      "variables": [
        { "name": "iface", "prompt": "Interface", "type": "interface", "default": "inside" },
        { "name": "src", "prompt": "Source IP", "type": "ip", "required": true },
        { "name": "dst", "prompt": "Destination IP", "type": "ip", "required": true }
      ],
      "steps": [
        "capture TSTCAP interface {iface} match ip host {src} host {dst}",
        { "instruction": "Generate traffic, then display the packets." },
        "show capture TSTCAP"
      ],
      "cleanup": ["no capture TSTCAP"],
      "notes": ["The capture name is fixed so cleanup is predictable."]
    },
    {
      "id": "radius-debug",
      "title": "RADIUS debugs — filtered user",
      "category": "aaa",
      "summary": "Turn on RADIUS debugging for one user, then stop it.",
      "keywords": ["radius", "aaa", "debug", "user"],
      "tags": ["radius", "debug"],
      "severity": "caution",
      "effect": "debug",
      "requires": ["enable mode"],
      "variables": [
        { "name": "user", "prompt": "Username", "type": "string", "required": true },
        { "name": "peer", "prompt": "NAS peer (optional)", "type": "ip", "required": false }
      ],
      "steps": [
        "terminal monitor",
        "debug radius user {user}",
        { "command": "show logging | include {peer}", "when": { "var": "peer", "notEmpty": true } },
        { "instruction": "Trigger the authentication attempt, then inspect the output." }
      ],
      "cleanup": [
        "undebug radius user {user}",
        "terminal no monitor"
      ]
    }
  ]
}
```

## Field reference

### Device type

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Lowercase slug. Must be unique. |
| `name` | yes | Display name. |
| `vendor` | yes | Grouping in the device picker. |
| `family` | yes | `Firewall`, `Router`, `Switch`, `Wireless`, `Endpoint`, `Cloud`, or `Other`. |
| `description` | no | One or two sentences for the picker preview. |
| `aliases` | no | Search terms such as `asa`, `pan-os`, or `win11`. |
| `notes` | no | General warnings or prerequisites. |
| `extends` | no | ID of another device type to inherit from. |
| `removeWorkflows` | no | IDs of inherited workflows to drop. |
| `categories` | yes | One or more `{ id, name, description? }` entries. |
| `workflows` | yes | One or more workflow objects. |

### Workflow

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Lowercase slug, unique within the pack. |
| `title` | yes | Shown in the search results and runbook header. |
| `category` | yes | Must match a category `id`. |
| `summary` | no | Short explanation of what the runbook answers. |
| `keywords` | no | Extra search terms. Include protocol names and symptoms. |
| `tags` | no | Short labels for filtering and future use. |
| `severity` | no | `info`, `caution`, or `danger`. Defaults to `info`. |
| `effect` | no | `read`, `debug`, `capture`, or `change`. Defaults to `read`. |
| `requires` | no | Strings shown as prerequisites, e.g. `enable mode`. |
| `variables` | no | Inputs requested before the runbook is built. |
| `steps` | yes | Command strings or step objects. |
| `verify` | no | Additional steps shown as verification. |
| `cleanup` | required for debug/capture | Commands to stop the debug or capture. |
| `notes` | no | Important context shown in the runbook. |
| `references` | no | `{ title, url }` links. |

### Steps

A step can be a plain string:

```json
"show version"
```

Or an object with context and conditions:

```json
{
  "command": "show logging | include {user}",
  "instruction": "Reproduce the login failure now.",
  "note": "This can take a few seconds.",
  "when": { "var": "user", "notEmpty": true },
  "unless": { "var": "mode", "equals": "silent" }
}
```

- `command` is included in “Copy commands” and is sent to the terminal.
- `instruction` is a manual step. It is shown in the runbook and is not sent.
- A debug or capture workflow must have at least one cleanup **command**. Instruction-only cleanup is not
  enough to arm the debug guard.

### Variables

```json
{ "name": "port", "prompt": "Destination port", "type": "port", "default": "443", "required": true }
```

| Field | Notes |
| --- | --- |
| `name` | Lowercase letters, numbers, and underscores. Referenced as `{name}`. |
| `prompt` | Label in the input form. |
| `type` | `string`, `ip`, `ipv4`, `ipv6`, `int`, `port`, `choice`, `interface`, `mac`, or `hostname`. |
| `required` | Defaults to `true`. Optional variables can be blank. |
| `default` | Pre-filled value. For a choice, must be one of the choice values. |
| `placeholder` | Hint shown in an empty input. |
| `help` | Small helper text. |
| `choices` | For `choice`: an array of strings or `{ value, label, description? }`. |
| `pattern` | Extra validation regex. It is anchored to the whole value. |
| `min`, `max` | Bounds for `int`. |
| `sensitive` | Masks the value in documentation exports. |

Use a `when` condition on a step that references an optional variable. Otherwise an empty value is
substituted and the command can become ambiguous. The validator warns about this.

### Conditions

```json
{ "var": "mode", "equals": "filtered" }
{ "var": "user", "notEmpty": true }
{ "var": "peer", "empty": true }
{ "var": "protocol", "notEquals": "icmp" }
```

Conditions are evaluated against the submitted variable values. Multiple operators in one condition are
ANDed. Steps are included only if their `when` passes and their `unless` does not.

### Placeholders

`{name}` is replaced with the submitted value. To keep a literal brace, use `{{` and `}}`:

```json
"show logging | include {{important}}"
```

Unknown placeholders are a validation error. Placeholders inside `instruction` text are substituted too.

## Inheritance

A child pack can build on a parent:

```json
{
  "id": "acme-edge-12",
  "name": "Acme Edge 12",
  "vendor": "Acme",
  "family": "Firewall",
  "extends": "acme-edge",
  "categories": [],
  "workflows": [
    {
      "id": "radius-debug",
      "title": "RADIUS debugs — Edge 12",
      "category": "aaa",
      "summary": "Overrides the parent workflow with an Edge-12-specific command.",
      "keywords": ["radius"],
      "severity": "caution",
      "effect": "debug",
      "steps": ["debug aaa radius {user}"],
      "cleanup": ["no debug aaa radius"]
    }
  ]
}
```

- Categories and workflows are merged by `id`.
- A child definition with the same `id` replaces the parent entry.
- `removeWorkflows` removes inherited entries by ID.
- Aliases and notes are unioned.
- Full packs (not just overrides) can use inheritance too.
- Avoid inheritance cycles.

## Validation rules

TSTerm checks:

- Required fields, slug format, and unique IDs.
- Every workflow category exists.
- Every placeholder and condition refers to a declared variable.
- Choice defaults are valid.
- Regex patterns compile.
- Debug and capture workflows have cleanup commands.
- Duplicate categories/workflows are reported.
- Optional variables used without a condition get a warning.
- Unused variables get a warning.
- A pack with errors is not loaded; other packs continue to work.

The JSON Schema at [../schemas/device-pack.schema.json](../schemas/device-pack.schema.json) helps with editor
completion and structural errors, but the app performs the deeper cross-reference checks.

## Quality checklist

- Prefer read-only commands. If a workflow changes state, say so in `notes` and provide cleanup.
- Keep one workflow focused on one question.
- Use commands that are valid on the named platform and release. Note version-specific behavior.
- Include `terminal monitor` / `terminal pager 0` steps where the platform needs them.
- Do not put passwords or API keys in a pack. Use environment variables such as `$MERAKI_API_KEY`.
- Test a workflow on a lab device before sharing it.
- Include search keywords for the symptoms, protocols, and command names an engineer might type.
