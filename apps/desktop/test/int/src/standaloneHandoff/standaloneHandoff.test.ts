import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectStandaloneCandidate } from "../../../../src/standaloneHandoff/inspectStandaloneCandidate.ts";
import type { HandoffOperations } from "../../../../src/standaloneHandoff/operations.ts";
import { handoffOperations } from "../../../../src/standaloneHandoff/operations.ts";
import { handoffStandalone } from "../../../../src/standaloneHandoff/standaloneHandoff.ts";

const fixture = async () => {
	const home = await mkdtemp("/tmp/trl-desktop-handoff-");
	await mkdir(join(home, "db"));
	await writeFile(join(home, "db", "PG_VERSION"), "17");
	await writeFile(join(home, "trellis.lock"), JSON.stringify({ pid: 1234, role: "server", port: 4521 }));
	const events: string[] = [];
	let alive = true;
	const operations: HandoffOperations = {
		alive: () => alive,
		launchdOwner: async () => ({ pid: 1234, home }),
		disable: async () => {
			events.push("disable");
		},
		bootout: async () => {
			events.push("bootout");
		},
		waitForExit: async () => {
			events.push("exit");
			alive = false;
		},
		prepare: async (_resources, candidate) => {
			events.push("backup-and-pause");
			return { home: candidate.home, backupPath: candidate.backupPath, automationPaused: true, restoreCommands: [] };
		},
	};
	return { home, events, operations };
};

test("confirmed handoff disables and stops only the matching service before offline preparation", async () => {
	const f = await fixture();
	try {
		const candidate = await inspectStandaloneCandidate(f.home, f.operations);
		expect(candidate.service?.pid).toBe(1234);
		expect(candidate.backupPath).toStartWith(join(candidate.home, "backups", "desktop-handoff-"));
		expect(f.events).toEqual([]);
		await handoffStandalone(candidate, "/unused/resources", f.operations);
		expect(f.events).toEqual(["disable", "bootout", "exit", "backup-and-pause"]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
	}
});

test("a changed owner rejects before it stops any service", async () => {
	const f = await fixture();
	try {
		const candidate = await inspectStandaloneCandidate(f.home, f.operations);
		f.operations.launchdOwner = async () => ({ pid: 9999, home: f.home });
		await expect(handoffStandalone(candidate, "/unused", f.operations)).rejects.toThrow("owner");
		expect(f.events).toEqual([]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
	}
});

test("a copied lock cannot hand off the service that owns a different home", async () => {
	const f = await fixture();
	const copy = await fixture();
	try {
		await expect(inspectStandaloneCandidate(copy.home, f.operations)).rejects.toThrow("unknown live owner");
		f.operations.launchdOwner = async () => ({ pid: 1234, home: null });
		await expect(inspectStandaloneCandidate(f.home, f.operations)).rejects.toThrow("unknown live owner");
		expect(f.events).toEqual([]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
		await rm(copy.home, { recursive: true, force: true });
	}
});

test("offline homes receive a backup and pause without service commands", async () => {
	const f = await fixture();
	try {
		f.operations.alive = () => false;
		const candidate = await inspectStandaloneCandidate(f.home, f.operations);
		expect(candidate.service).toBeNull();
		await handoffStandalone(candidate, "/unused", f.operations);
		expect(f.events).toEqual(["backup-and-pause"]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
	}
});

test("a replacement after disable is not stopped", async () => {
	const f = await fixture();
	try {
		const candidate = await inspectStandaloneCandidate(f.home, f.operations);
		f.operations.disable = async () => {
			f.events.push("disable");
			f.operations.launchdOwner = async () => ({ pid: 9999, home: f.home });
		};
		await expect(handoffStandalone(candidate, "/unused", f.operations)).rejects.toThrow("owner");
		expect(f.events).toEqual(["disable"]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
	}
});

test("preparation failure retains actionable restoration steps without a restart", async () => {
	const f = await fixture();
	try {
		const candidate = await inspectStandaloneCandidate(f.home, f.operations);
		f.operations.prepare = async () => {
			throw new Error("fixture backup failure");
		};
		await expect(handoffStandalone(candidate, "/unused", f.operations)).rejects.toThrow("launchctl enable");
		expect(f.events).toEqual(["disable", "bootout", "exit"]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
	}
});

test("an unresolved native process rejects before any service action", async () => {
	const f = await fixture();
	try {
		await mkdir(join(f.home, "runtime", "sessions"), { recursive: true });
		await writeFile(
			join(f.home, "runtime", "sessions", "unknown.session.json"),
			JSON.stringify({ session: { id: "unknown", status: "unknown", pid: 8765 } }),
		);
		await expect(inspectStandaloneCandidate(f.home, f.operations)).rejects.toThrow("Runtime session unknown");
		expect(f.events).toEqual([]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
	}
});

test("a live runtime, orphan socket, and invalid ownership refuse preflight", async () => {
	const f = await fixture();
	try {
		await mkdir(join(f.home, "runtime"));
		const manifest = join(f.home, "runtime", "manifest.json");
		await writeFile(manifest, JSON.stringify({ pid: 4321 }));
		await expect(inspectStandaloneCandidate(f.home, f.operations)).rejects.toThrow("Runtime owner 4321 is live");
		await rm(manifest);
		const socket = join(f.home, "runtime", "runtime.sock");
		await writeFile(socket, "orphan");
		await expect(inspectStandaloneCandidate(f.home, f.operations)).rejects.toThrow("no confirmed owner");
		await rm(socket);
		await writeFile(join(f.home, "trellis.lock"), "null");
		await expect(inspectStandaloneCandidate(f.home, f.operations)).rejects.toThrow("invalid ownership metadata");
		expect(f.events).toEqual([]);
	} finally {
		await rm(f.home, { recursive: true, force: true });
	}
});

test("the maintenance process receives literal reviewed paths and returns its error", async () => {
	const resources = await mkdtemp("/tmp/trl-handoff-args-");
	try {
		await mkdir(join(resources, "bin"));
		await mkdir(join(resources, "apps/server/src/standaloneHandoff"), { recursive: true });
		await symlink(process.execPath, join(resources, "bin/bun"));
		const entry = join(resources, "apps/server/src/standaloneHandoff/entry.ts");
		await writeFile(entry, "console.log(JSON.stringify({received:process.argv.slice(2)}));");
		const candidate = { home: "/tmp/a 'home' $(bytes)", backupPath: "/tmp/a backup", service: null };
		const result = (await handoffOperations.prepare(resources, candidate)) as unknown as { received: string[] };
		expect(result.received).toEqual(["--home", candidate.home, "--backup", candidate.backupPath]);
		await writeFile(entry, 'process.stderr.write("The host still owns its database.\\n");process.exit(2);');
		await expect(handoffOperations.prepare(resources, candidate)).rejects.toThrow("The host still owns its database.");
	} finally {
		await rm(resources, { recursive: true, force: true });
	}
});
