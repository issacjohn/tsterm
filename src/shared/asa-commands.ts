export interface AsaCommandInfo {
  name: string
  description: string
  example?: string
}

/**
 * Top-level ASA privileged EXEC commands. Subcommands and optional keywords
 * must come from `?` help, the runbook context, or an imported vendor
 * reference; this index only gives the model reliable command names.
 */
export const ASA_COMMANDS: AsaCommandInfo[] = [
  { name: 'aaa', description: 'AAA related actions', example: 'aaa ?' },
  { name: 'aaa-server', description: 'Specify a AAA server', example: 'aaa-server ?' },
  { name: 'activate-tunnel-group-scripts', description: 'Reload ASDM generated scripts for username-from-certificate', example: 'activate-tunnel-group-scripts ?' },
  { name: 'asdm', description: 'Disconnect a specific ASDM session', example: 'asdm ?' },
  { name: 'attribute', description: 'Modify a monitored attribute', example: 'attribute ?' },
  { name: 'backup', description: 'Back up configuration and images of the device', example: 'backup ?' },
  { name: 'blocks', description: 'Set block diagnostic parameters', example: 'blocks ?' },
  { name: 'call-home', description: 'Test Smart Call-Home configuration', example: 'call-home ?' },
  { name: 'capture', description: 'Capture inbound and outbound packets on one or more interfaces', example: 'capture TSTCAP interface outside match ip host 1.1.1.1 host 8.8.8.8' },
  { name: 'cd', description: 'Change current directory', example: 'cd ?' },
  { name: 'change-password', description: 'Change password', example: 'change-password ?' },
  { name: 'clear', description: 'Reset functions', example: 'clear ?' },
  { name: 'client-update', description: 'Execute client updates on all or specific tunnel-groups', example: 'client-update ?' },
  { name: 'clock', description: 'Manage the system clock', example: 'clock ?' },
  { name: 'cluster', description: 'Cluster exec mode commands', example: 'cluster ?' },
  { name: 'configure', description: 'Configure using various methods', example: 'configure terminal' },
  { name: 'conn', description: 'Connection table', example: 'show conn' },
  { name: 'consent-token', description: 'Execute consent-token command', example: 'consent-token ?' },
  { name: 'copy', description: 'Copy from one file to another', example: 'copy running-config startup-config' },
  { name: 'cpu', description: 'General CPU stats collection tools', example: 'cpu ?' },
  { name: 'crashinfo', description: 'Crash information', example: 'show crashinfo ?' },
  { name: 'crypto', description: 'Execute crypto commands', example: 'show crypto ikev2 sa' },
  { name: 'cts', description: 'Cisco Trusted Security EXEC mode commands', example: 'cts ?' },
  { name: 'debug', description: 'Debugging functions (see also undebug)', example: 'debug radius all' },
  { name: 'delete', description: 'Delete a file', example: 'delete ?' },
  { name: 'dir', description: 'List files on a filesystem', example: 'dir flash:' },
  { name: 'disable', description: 'Exit from privileged mode', example: 'disable' },
  { name: 'dns', description: 'Update FQDN IP addresses', example: 'dns ?' },
  { name: 'downgrade', description: 'Downgrade the file system and reboot', example: 'downgrade ?' },
  { name: 'dynamic-access-policy-config', description: 'Activate the DAP selection configuration file', example: 'dynamic-access-policy-config ?' },
  { name: 'dynamic-filter', description: 'Dynamic Filter commands', example: 'dynamic-filter ?' },
  { name: 'erase', description: 'Erase a filesystem', example: 'erase ?' },
  { name: 'event', description: 'Show configured event manager services', example: 'event ?' },
  { name: 'exit', description: 'Exit from the EXEC', example: 'exit' },
  { name: 'export', description: 'Copy a file to the specified remote location', example: 'export ?' },
  { name: 'failover', description: 'Perform failover operation in EXEC mode', example: 'show failover' },
  { name: 'fips', description: 'Execute FIPS tests', example: 'fips ?' },
  { name: 'format', description: 'Format a filesystem', example: 'format ?' },
  { name: 'fsck', description: 'Filesystem check', example: 'fsck ?' },
  { name: 'help', description: 'Interactive help for commands', example: 'help' },
  { name: 'import', description: 'Copy a file from a remote location and initiate WebVPN actions', example: 'import ?' },
  { name: 'kill', description: 'Terminate a telnet session', example: 'kill ?' },
  { name: 'license', description: 'Register or deregister with the Cisco Licensing Authority', example: 'show license' },
  { name: 'logging', description: 'Configure flash file name to save the logging buffer', example: 'show logging' },
  { name: 'logout', description: 'Exit from the EXEC', example: 'logout' },
  { name: 'memory', description: 'Memory tools', example: 'show memory' },
  { name: 'mkdir', description: 'Create a new directory', example: 'mkdir ?' },
  { name: 'more', description: 'Display the contents of a file', example: 'more ?' },
  { name: 'network-service', description: 'Specify a network-service operation', example: 'network-service ?' },
  { name: 'no', description: 'Negate a command or set its defaults', example: 'no capture TSTCAP' },
  { name: 'packet-tracer', description: 'Packet processing debug tool (trace, capture, replay)', example: 'packet-tracer input inside tcp 10.1.1.10 12345 8.8.8.8 53 detailed' },
  { name: 'perfmon', description: 'Change or view performance monitoring options', example: 'perfmon ?' },
  { name: 'ping', description: 'Send echo messages', example: 'ping 8.8.8.8' },
  { name: 'pwd', description: 'Display current working directory', example: 'pwd' },
  { name: 'quit', description: 'Exit from the EXEC', example: 'quit' },
  { name: 'redundant-interface', description: 'Redundant interface', example: 'redundant-interface ?' },
  { name: 'reload', description: 'Halt and reload the system', example: 'reload' },
  { name: 'rename', description: 'Rename a file', example: 'rename ?' },
  { name: 'restore', description: 'Restore configuration and images from a backup', example: 'restore ?' },
  { name: 'revert', description: 'Remove an imported file from RAMFS and flash and restore defaults', example: 'revert ?' },
  { name: 'rmdir', description: 'Remove an existing directory', example: 'rmdir ?' },
  { name: 'show', description: 'Show running system information', example: 'show interface ip brief' },
  { name: 'shun', description: 'Manage filtering of packets from undesired hosts', example: 'show shun' },
  { name: 'ssh', description: 'Disconnect a specific SSH session', example: 'ssh ?' },
  { name: 'terminal', description: 'Turn on or off syslogging or interactive output for this terminal', example: 'terminal monitor' },
  { name: 'test', description: 'Test subsystems, memory, interfaces, and configurations', example: 'test ?' },
  { name: 'traceroute', description: 'Trace route to a destination', example: 'traceroute 8.8.8.8' },
  { name: 'undebug', description: 'Disable debugging functions (see also debug)', example: 'undebug radius all' },
  { name: 'user-alert', description: 'Launch a pop-up browser window for clientless WebVPN sessions', example: 'user-alert ?' },
  { name: 'user-identity', description: 'Execute user-identity firewall commands', example: 'show user-identity ?' },
  { name: 'verify', description: 'Verify a file', example: 'verify ?' },
  { name: 'vpn-sessiondb', description: 'Configure or show the VPN Session Manager', example: 'show vpn-sessiondb summary' },
  { name: 'webvpn-cache', description: 'Remove cached objects', example: 'webvpn-cache ?' },
  { name: 'who', description: 'Show active administration sessions on the system', example: 'who' },
  { name: 'write', description: 'Write the running configuration to memory, network, or terminal', example: 'write memory' }
]

export function buildAsaCommandIndex(limit = 7000): string {
  const lines = ASA_COMMANDS.map((command) => {
    const example = command.example ? ` Example: ${command.example}.` : ''
    return `- ${command.name}: ${command.description}.${example}`
  })
  return `Top-level ASA commands (use <command> ? or the imported ASA command reference for exact subcommands and options; never invent them):\n${lines.join('\n')}`.slice(
    0,
    limit
  )
}
