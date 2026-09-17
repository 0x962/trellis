import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import type { ServiceTransport } from "../../../../src/db/transport.ts";
import type { GhRunner } from "../../../../src/gh/run.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { noGh, signedInGh } from "../../../helpers/ctx.ts";

// GET /api/health, GET /api/gh, POST /api/gh/check, POST /api/backup, and
// GET /api/harnesses/{harness}/models over the test app.

// A transport that writes the name of every service call into `names`.
const recordNames =
	(names: string[]) =>
	(inner: ServiceTransport): ServiceTransport => ({
		...inner,
		call: (name, ctx, input, timing) => {
			names.push(name);
			return inner.call(name, ctx, input, timing);
		},
	});

// A gh runner whose `gh auth status` reports `user` as signed in.
const signedInAs = (user: string): GhRunner =>
	Object.assign(
		async () => ({
			ok: true as const,
			code: 0,
			stdout: `github.com\n  Logged in to github.com account ${user} (keyring)\n`,
			stderr: "",
		}),
		{ bin: "gh", timeoutMs: 1000 },
	) as GhRunner;

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp({ ghStatus: signedInGh });
});
afterAll(() => t.close());

describe("system", () => {
	test("system.health returns the documented health shape", async () => {
		const response = await t.api("/api/health", { actor: null });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual([
			"addresses",
			"apiVersion",
			"bootId",
			"db",
			"gh",
			"ok",
			"rss",
			"version",
		]);
		expect(response.body.addresses).toEqual(await t.runtime.addresses());
		expect(response.body.ok).toBe(true);
		expect(response.body.version).toBe(t.runtime.version);
		expect(response.body.apiVersion).toMatch(/\S+/);
		expect(response.body.bootId).toBe(t.bootId);
		expect(response.body.rss).toBeGreaterThan(0);
		expect(response.body.db.ok).toBe(true);
		expect(response.body.db.sizeBytes).toBeGreaterThan(0);
		expect(response.body.gh).toEqual(signedInGh());
	});

	test("system.harnessModels answers with the list of the harness and no service call", async () => {
		const names: string[] = [];
		const asked: string[] = [];
		const app = await createTestApp({
			wrapTransport: recordNames(names),
			harnessModels: async (harness) => {
				asked.push(harness);
				return [{ value: "anthropic/claude-sonnet-5", label: "Sonnet" }];
			},
		});

		const response = await app.api("/api/harnesses/claude/models", { actor: null });
		const muse = await app.api("/api/harnesses/muse/models", { actor: null });
		const unknown = await app.api("/api/harnesses/custom/models", { actor: null });
		await app.close();

		expect(response.status).toBe(200);
		expect(response.body).toEqual([{ value: "anthropic/claude-sonnet-5", label: "Sonnet" }]);
		expect(muse.status).toBe(200);
		expect(asked).toEqual(["claude", "muse"]);
		expect(names).toEqual([]);
		expect(unknown.status).toBe(400);
		expect(unknown.body.code).toBe("INPUT_VALIDATION_FAILED");
	});

	test("system.harnessModels answers a lister failure with the message of the program", async () => {
		const app = await createTestApp({
			harnessModels: async () => {
				throw new Error("Harness executable claude was not found on PATH: /usr/bin");
			},
		});

		const response = await app.api("/api/harnesses/claude/models", { actor: null });
		await app.close();

		expect(response.status).toBe(503);
		expect(response.body.code).toBe("HARNESS_MODELS_FAILED");
		expect(response.body.data).toEqual({ message: "Harness executable claude was not found on PATH: /usr/bin" });
	});

	test("system.gh returns the gh state", async () => {
		const response = await t.api("/api/gh", { actor: null });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["checkedAt", "message", "ok", "reason", "user"]);
	});

	// `gh auth status` can take seconds, so neither gh procedure reaches the
	// database worker.
	test("system.gh answers from the kept gh state with no gh call and no service call", async () => {
		const names: string[] = [];
		const app = await createTestApp({ ghStatus: signedInGh, gh: noGh, wrapTransport: recordNames(names) });

		const response = await app.api("/api/gh", { actor: null });
		await app.close();

		expect(response.status).toBe(200);
		expect(response.body).toEqual(signedInGh());
		expect(names).toEqual([]);
	});

	test("system.checkGh runs gh auth status with no service call", async () => {
		const names: string[] = [];
		const app = await createTestApp({ gh: signedInAs("erin"), wrapTransport: recordNames(names) });

		const response = await app.api("/api/gh/check", { method: "POST" });
		await app.close();

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ ok: true, user: "erin", reason: null });
		expect(names).toEqual([]);
	});

	test("system.backup writes an archive under the data home", async () => {
		const response = await t.api("/api/backup", { method: "POST" });

		expect(response.status).toBe(200);
		expect(Object.keys(response.body).sort()).toEqual(["bytes", "path"]);
		expect(response.body.path).toStartWith(t.config.backupsDir);
		expect(existsSync(response.body.path)).toBe(true);
		expect(statSync(response.body.path).size).toBe(response.body.bytes);
	});
});
