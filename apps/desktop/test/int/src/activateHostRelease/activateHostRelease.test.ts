import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activateHostRelease } from "../../../../src/activateHostRelease/activateHostRelease.ts";
import { recordActiveRelease } from "../../../../src/updateStatus/updateStatus.ts";

const fixture = async () => {
	const directory = await mkdtemp(join(tmpdir(), `trellis-activate-${process.pid}-`));
	const home = join(directory, "home");
	await mkdir(home);
	const release = async (id: string, protocol = 6) => {
		const manifest = { id: id.repeat(64), version: "0.0.0", protocol };
		const root = join(directory, "releases", manifest.id);
		await mkdir(root, { recursive: true });
		await writeFile(join(root, "release.json"), JSON.stringify(manifest));
		return { root, manifest };
	};
	const old = await release("a");
	const next = await release("b");
	await recordActiveRelease(home, old);
	const calls: string[] = [];
	const host = { pid: process.pid, origin: "http://127.0.0.1:4521", token: "test" };
	const actions = {
		ensureService: async () => {
			calls.push("ensure");
		},
		adopt: async () => {
			calls.push("adopt");
			return host;
		},
		unregister: async () => {
			calls.push("unregister");
		},
		shutdown: async () => {
			calls.push("shutdown");
			await rm(join(home, "runtime/manifest.json"), { force: true });
		},
		wait: async () => {
			calls.push("wait");
		},
		capture: async () => {
			calls.push("capture");
		},
		resume: async () => {
			calls.push("resume");
		},
		register: async () => {
			calls.push("register");
			await recordActiveRelease(home, next);
		},
	};
	return { directory, home, old, next, calls, host, actions };
};

test("app startup replaces a different host release and keeps its connection", async () => {
	const f = await fixture();
	try {
		await mkdir(join(f.home, "runtime"));
		await writeFile(join(f.home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 6 }));
		expect(await activateHostRelease(f.home, "helper", f.next, f.actions)).toEqual(f.host);
		expect(f.calls).toEqual(["unregister", "wait", "shutdown", "register", "adopt"]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("app startup adopts a current host without a service restart", async () => {
	const f = await fixture();
	try {
		await activateHostRelease(f.home, "helper", f.old, f.actions);
		expect(f.calls).toEqual(["ensure", "adopt"]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("app startup stops the old runtime before an incompatible package activates", async () => {
	const f = await fixture();
	try {
		await mkdir(join(f.home, "runtime"));
		await writeFile(join(f.home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 5 }));
		await activateHostRelease(f.home, "helper", f.next, f.actions);
		expect(f.calls).toEqual(["unregister", "wait", "shutdown", "register", "adopt"]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("app startup rejects a replacement service that starts the wrong release", async () => {
	const f = await fixture();
	try {
		f.actions.register = async () => {
			f.calls.push("register");
		};
		await expect(activateHostRelease(f.home, "helper", f.next, f.actions)).rejects.toThrow("expected release");
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("a new package does not wait for the previous host to respond", async () => {
	const f = await fixture();
	try {
		f.actions.adopt = async () => {
			if (!f.calls.includes("register")) throw new Error("Previous host is unresponsive");
			f.calls.push("adopt");
			return f.host;
		};
		expect(await activateHostRelease(f.home, "helper", f.next, f.actions)).toEqual(f.host);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("a failed runtime stop prevents registration of the new package", async () => {
	const f = await fixture();
	try {
		f.actions.shutdown = async () => {
			throw new Error("Unknown process owner");
		};
		await expect(activateHostRelease(f.home, "helper", f.next, f.actions)).rejects.toThrow("Unknown process owner");
		expect(f.calls).toEqual(["unregister", "wait"]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("app startup rejects a new host that still uses a previous runtime", async () => {
	const f = await fixture();
	try {
		f.actions.register = async () => {
			await recordActiveRelease(f.home, f.next);
			await mkdir(join(f.home, "runtime"));
			await writeFile(
				join(f.home, "runtime/manifest.json"),
				JSON.stringify({ pid: process.pid, version: 6, releaseId: f.old.manifest.id }),
			);
		};
		await expect(activateHostRelease(f.home, "helper", f.next, f.actions)).rejects.toThrow("expected release");
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("a fresh app completes service registration before it adopts the host", async () => {
	const f = await fixture();
	try {
		await rm(join(f.home, "desktop-active-release.json"));
		await activateHostRelease(f.home, "helper", f.next, f.actions);
		expect(f.calls).toEqual(["ensure", "adopt"]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("macOS approval prevents host adoption until service preparation succeeds", async () => {
	const f = await fixture();
	try {
		f.actions.ensureService = async () => {
			f.calls.push("approval");
			throw new Error("requiresApproval");
		};
		await expect(activateHostRelease(f.home, "helper", f.old, f.actions)).rejects.toThrow("requiresApproval");
		expect(f.calls).toEqual(["approval"]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("an unfinished agent resume cannot block package activation", async () => {
	const f = await fixture();
	try {
		await writeFile(join(f.home, "restart-plan.json"), "obsolete restart plan");
		f.actions.capture = async () => {
			throw new Error("Desktop must not capture agents");
		};
		f.actions.resume = async () => {
			throw new Error("Desktop must not resume agents");
		};
		expect(await activateHostRelease(f.home, "helper", f.next, f.actions)).toEqual(f.host);
		expect(f.calls).toEqual(["unregister", "wait", "shutdown", "register", "adopt"]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});

test("release activation reports each stage before its work starts", async () => {
	const f = await fixture();
	try {
		await activateHostRelease(f.home, "helper", f.next, f.actions, async (stage) => {
			f.calls.push(stage);
		});
		expect(f.calls).toEqual([
			"Check host compatibility",
			"Stop background host",
			"unregister",
			"wait",
			"Restart agent runtime",
			"shutdown",
			"Start background host",
			"register",
			"Wait for background host",
			"adopt",
		]);
	} finally {
		await rm(f.directory, { recursive: true, force: true });
	}
});
