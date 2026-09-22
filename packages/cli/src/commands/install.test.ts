import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Deps, Stream } from "../index.ts";
import { run } from "../index.ts";
import { installationPaths } from "../installation.ts";

const stream = () => {
	let text = "";
	return {
		stream: { isTTY: false, write: (value: string) => (text += value) } satisfies Stream,
		text: () => text,
	};
};

const installedPlist = (serverEntry: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>ProgramArguments</key>
	<array>
		<string>/opt/homebrew/bin/bun</string>
		<string>${serverEntry}</string>
	</array>
</dict>
</plist>
`;

const writeInstalledPlist = (path: string, serverEntry: string) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, installedPlist(serverEntry));
};

const makeDeps = (home: string, launchdPrints: boolean[]) => {
	const stdout = stream();
	const stderr = stream();
	const calls: string[][] = [];
	const deps: Deps = {
		fetch: async (request) =>
			new Response("", { status: request.url === "http://127.0.0.1:4521/api/health" ? 200 : 404 }),
		env: {},
		stdout: stdout.stream,
		stderr: stderr.stream,
		stdin: async () => "",
		gitUserName: () => "Trellis Agent",
		osUser: () => "agent",
		now: () => new Date("2026-09-22T00:00:00.000Z"),
		sleep: async () => {},
		open: () => {},
		signal: new AbortController().signal,
		apiVersion: "0.0.0",
		run: async (args) => {
			calls.push(args);
			if (args[0] === "launchctl" && args[1] === "print") {
				return { code: launchdPrints.shift() ? 0 : 1, stderr: "" };
			}
			return { code: 0, stderr: "" };
		},
		launchdDomain: "gui/501",
		home,
		which: (name) => (name === "bun" ? "/opt/homebrew/bin/bun" : null),
		spawn: () => ({ exited: Promise.resolve(0), kill: () => {} }),
	};
	return { deps, calls, stdout, stderr };
};

test("install refuses to take over a loaded service from another checkout", async () => {
	const root = mkdtempSync(join(tmpdir(), "trellis-install-"));
	try {
		const home = join(root, "home");
		const prefix = join(root, "prefix");
		const paths = installationPaths({}, home, prefix);
		const other = join(root, "other-checkout");
		writeInstalledPlist(paths.plist, join(other, "apps/server/src/index.ts"));
		const { deps, calls, stderr } = makeDeps(home, [true]);

		const code = await run(["install", "--prefix", prefix], deps);

		expect(code).toBe(1);
		expect(stderr.text()).toContain(`com.trellis.server already belongs to ${other}.`);
		expect(stderr.text()).toContain("trellis install --force");
		expect(calls).toEqual([["launchctl", "print", "gui/501/com.trellis.server"]]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("install keeps working when the same checkout owns the loaded service", async () => {
	const root = mkdtempSync(join(tmpdir(), "trellis-install-"));
	try {
		const home = join(root, "home");
		const prefix = join(root, "prefix");
		const paths = installationPaths({}, home, prefix);
		writeInstalledPlist(paths.plist, paths.serverEntry);
		const { deps, calls } = makeDeps(home, [true, false]);

		const code = await run(["install", "--prefix", prefix], deps);

		expect(code).toBe(0);
		expect(calls).toContainEqual(["launchctl", "bootout", "gui/501/com.trellis.server"]);
		expect(calls).toContainEqual(["launchctl", "bootstrap", "gui/501", paths.plist]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("install --force takes over a loaded service from another checkout", async () => {
	const root = mkdtempSync(join(tmpdir(), "trellis-install-"));
	try {
		const home = join(root, "home");
		const prefix = join(root, "prefix");
		const paths = installationPaths({}, home, prefix);
		const other = join(root, "other-checkout");
		writeInstalledPlist(paths.plist, join(other, "apps/server/src/index.ts"));
		const { deps, calls } = makeDeps(home, [false]);

		const code = await run(["install", "--prefix", prefix, "--force"], deps);

		expect(code).toBe(0);
		expect(calls).toContainEqual(["launchctl", "bootout", "gui/501/com.trellis.server"]);
		expect(calls).toContainEqual(["launchctl", "bootstrap", "gui/501", paths.plist]);
		expect(readFileSync(paths.plist, "utf8")).toContain(paths.serverEntry);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
