import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectCurrentService } from "../../../../src/stopCurrentService/inspectCurrentService.ts";
import { stopCurrentService } from "../../../../src/stopCurrentService/stopCurrentService.ts";

test("inspection never creates a missing home or token", async () => {
	const directory = await mkdtemp("/tmp/trl-service-inspect-");
	try {
		const home = join(directory, "missing");
		expect(await inspectCurrentService(home)).toEqual({ host: null, runtimeActive: false });
		expect(existsSync(home)).toBe(false);
		await mkdir(home);
		await writeFile(join(home, "trellis.lock"), JSON.stringify({ pid: process.pid, role: "server", port: 1234 }));
		await writeFile(join(home, "desktop-service.pid"), String(process.pid));
		await expect(inspectCurrentService(home)).rejects.toThrow("no desktop token");
		expect(existsSync(join(home, "desktop-token"))).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a registered stopped service can unregister before its data home exists", async () => {
	const directory = await mkdtemp("/tmp/trl-service-inspect-");
	try {
		const helper = join(directory, "helper");
		await writeFile(
			helper,
			'#!/bin/sh\nif [ "$1" = unregister ]; then printf \'{"status":"notRegistered","bundle":"fixture"}\\n\'; else printf \'{"status":"enabled","bundle":"fixture"}\\n\'; fi\n',
			{ mode: 0o700 },
		);
		const home = join(directory, "host");
		await stopCurrentService({ home, helper, userData: directory });
		expect(existsSync(home)).toBe(false);
		expect(existsSync(join(directory, "selected-home.json"))).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

for (const status of ["running", "unknown"]) {
	test(`a retained ${status} session blocks a directory switch without a live daemon`, async () => {
		const home = await mkdtemp("/tmp/trl-service-inspect-");
		try {
			await mkdir(join(home, "runtime/sessions"), { recursive: true });
			await writeFile(join(home, "runtime/sessions/attempt.session.json"), JSON.stringify({ session: { status } }));
			expect(await inspectCurrentService(home)).toEqual({ host: null, runtimeActive: true });
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});
}

test("an owner with no matching desktop service record is not adopted", async () => {
	const home = await mkdtemp("/tmp/trl-service-inspect-");
	try {
		await writeFile(join(home, "trellis.lock"), JSON.stringify({ pid: process.pid, role: "server", port: 1234 }));
		await expect(inspectCurrentService(home)).rejects.toThrow("unknown live owner");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

for (const changed of [false, true]) {
	test(`authenticated host inspection ${changed ? "rejects changed ownership" : "preserves the existing token"}`, async () => {
		const home = await mkdtemp("/tmp/trl-service-inspect-");
		const token = "existing-fixture-token";
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				if (request.headers.get("Authorization") === `Bearer ${token}`) {
					if (changed)
						await writeFile(join(home, "trellis.lock"), JSON.stringify({ pid: process.pid, role: "server", port: 1 }));
					return Response.json({ ok: true });
				}
				return new Response("Unauthorized", { status: 401 });
			},
		});
		try {
			await writeFile(
				join(home, "trellis.lock"),
				JSON.stringify({ pid: process.pid, role: "server", port: server.port }),
			);
			await writeFile(join(home, "desktop-service.pid"), String(process.pid));
			await writeFile(join(home, "desktop-token"), token);
			if (changed) await expect(inspectCurrentService(home)).rejects.toThrow("owner changed");
			else
				expect((await inspectCurrentService(home)).host).toEqual({
					pid: process.pid,
					origin: `http://127.0.0.1:${server.port}`,
					token,
				});
			expect(await readFile(join(home, "desktop-token"), "utf8")).toBe(token);
		} finally {
			server.stop(true);
			await rm(home, { recursive: true, force: true });
		}
	});
}

test("a stopped service with a removed selected directory can unregister without recreation", async () => {
	const directory = await mkdtemp("/tmp/trl-service-missing-");
	try {
		const home = join(directory, "removed");
		const helper = join(directory, "helper");
		await writeFile(
			helper,
			'#!/bin/sh\nif [ "$1" = unregister ]; then echo \'{"status":"notRegistered","bundle":"fixture"}\'; else echo \'{"status":"enabled","bundle":"fixture"}\'; fi\n',
			{ mode: 0o700 },
		);
		const selection = JSON.stringify({ version: 1, home });
		await writeFile(join(directory, "selected-home.json"), selection);
		await stopCurrentService({ home, helper, userData: directory });
		expect(existsSync(home)).toBe(false);
		expect(await readFile(join(directory, "selected-home.json"), "utf8")).toBe(selection);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a null ownership record cannot prove that the host stopped", async () => {
	const home = await mkdtemp("/tmp/trl-service-invalid-");
	try {
		await writeFile(join(home, "trellis.lock"), "null");
		await expect(inspectCurrentService(home)).rejects.toThrow("owner record is invalid");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
