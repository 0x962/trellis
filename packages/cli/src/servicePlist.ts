import { dirname, resolve } from "node:path";
import type { installationPaths } from "./installation.ts";

// The plist of the launchd service com.trellis.server: the text install
// writes, and what install reads back from a plist on disk.

// The plist sets no TRELLIS_PORT, so the launchd server listens on 4521.
export const serverPort = 4521;

type Paths = ReturnType<typeof installationPaths>;

export type PlistOptions = {
	host: string | undefined;
	allowedHosts: string[];
	bun: string;
	superset: string | null;
	commit: string | null;
};

const xml = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const unxml = (value: string) =>
	value.replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");

const envEntry = (key: string, value: string) => `\t\t<key>${key}</key>\n\t\t<string>${xml(value)}</string>\n`;

// The server binds 127.0.0.1 when the plist sets no TRELLIS_HOST.
const hostEntry = (host: string | undefined) => (host === undefined ? "" : envEntry("TRELLIS_HOST", host));

// The server refuses a Host header that names a hostname it does not know.
// Each --allow-host name, such as a Tailscale Serve hostname, passes that
// check.
const allowedHostsEntry = (names: string[]) =>
	names.length === 0 ? "" : envEntry("TRELLIS_ALLOWED_HOSTS", names.join(","));

// launchd gives the server a PATH that holds only the bun directory and the
// system directories. The Superset CLI sits in ~/.superset/bin, outside that
// PATH. Without this key the server spawns "superset" from PATH, and every
// agents call fails as RUNNER_UNAVAILABLE.
const supersetEntry = (bin: string | null) => (bin === null ? "" : envEntry("TRELLIS_SUPERSET_BIN", bin));

// TRELLIS_CHECKOUT and TRELLIS_COMMIT name the tree and the commit of the
// install, so `launchctl print` and a later install show where the service
// came from.
const commitEntry = (commit: string | null) => (commit === null ? "" : envEntry("TRELLIS_COMMIT", commit));

// `bun` is the path that `which` finds on PATH, with no symlink resolved. A
// Homebrew bun on PATH is a symlink that `brew upgrade` moves to the new
// version. `process.execPath` names the versioned Cellar directory, which
// the upgrade deletes, and the agent then has no program to run.
export const plistText = (paths: Paths, options: PlistOptions) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.trellis.server</string>
	<key>ProgramArguments</key>
	<array>
		<string>${xml(options.bun)}</string>
		<string>${xml(paths.serverEntry)}</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>${xml(dirname(options.bun))}:${xml(paths.userHome)}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>HOME</key>
		<string>${xml(paths.userHome)}</string>
		<key>TRELLIS_HOME</key>
		<string>${xml(paths.dataHome)}</string>
		<key>NODE_ENV</key>
		<string>production</string>
		<key>TRELLIS_WEB_DIST</key>
		<string>${xml(paths.webDist)}</string>
${envEntry("TRELLIS_CHECKOUT", paths.repoRoot)}${commitEntry(options.commit)}${supersetEntry(options.superset)}${hostEntry(options.host)}${allowedHostsEntry(options.allowedHosts)}	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>ThrottleInterval</key>
	<integer>10</integer>
	<key>StandardOutPath</key>
	<string>${xml(paths.log)}</string>
	<key>StandardErrorPath</key>
	<string>${xml(paths.log)}</string>
</dict>
</plist>
`;

// The second program argument is the server entry, which sits at
// <checkout>/apps/server/src/index.ts.
const SERVER_ENTRY = /<key>ProgramArguments<\/key>\s*<array>\s*<string>[^<]*<\/string>\s*<string>([^<]*)<\/string>/;

const envValue = (text: string, key: string) => {
	const found = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(text);
	return found === null ? null : unxml(found[1]!);
};

// The service that a plist on disk starts. `commit` is null when the plist
// records no TRELLIS_COMMIT.
export type PlistService = { checkout: string; commit: string | null; port: number };

export const readPlist = (text: string): PlistService => ({
	checkout: resolve(unxml(SERVER_ENTRY.exec(text)![1]!), "../../../.."),
	commit: envValue(text, "TRELLIS_COMMIT"),
	port: Number(envValue(text, "TRELLIS_PORT") ?? serverPort),
});
