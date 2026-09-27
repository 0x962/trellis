import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { hostAuth } from "../../auth/auth.ts";
import { hostIdentityPaths, readHostDescriptor } from "./hostIdentity.ts";
import { readOrCreateIdentity } from "./identityStore.ts";

const roots: string[] = [];

const root = async () => {
	const path = await mkdtemp(join(tmpdir(), "trellis-host-identity-"));
	roots.push(path);
	return path;
};

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const context = (installationHome: string, home: string) => ({
	installationHome,
	home,
	apiVersion: "1",
	version: "0.0.0",
});

const dependencies = {
	readIdentity: readOrCreateIdentity,
	releaseId: "release-1",
	runtimeProtocol: 13,
	platform: "linux" as const,
	arch: "x64" as const,
	capabilities: ["host-identity"],
};

describe("host identity", () => {
	test("keeps the installation and data-home identities", async () => {
		const base = await root();
		const ctx = context(join(base, "installation"), join(base, "data"));
		const first = await readHostDescriptor(ctx, dependencies);
		const second = await readHostDescriptor(ctx, dependencies);

		expect(second).toEqual(first);
		for (const path of Object.values(hostIdentityPaths(ctx))) {
			expect((await stat(path)).mode & 0o777).toBe(0o600);
			expect((await readFile(path, "utf8")).trim()).toHaveLength(26);
		}
	});

	test("keeps one host identity across two data homes", async () => {
		const base = await root();
		const installationHome = join(base, "installation");
		const first = await readHostDescriptor(context(installationHome, join(base, "data-a")), dependencies);
		const second = await readHostDescriptor(context(installationHome, join(base, "data-b")), dependencies);

		expect(second.hostId).toBe(first.hostId);
		expect(second.dataHomeId).not.toBe(first.dataHomeId);
	});

	test("gives a restored database a new installation identity", async () => {
		const source = await root();
		const destination = await root();
		const sourceHome = join(source, "data");
		const destinationHome = join(destination, "data");
		await mkdir(join(sourceHome, "db"), { recursive: true });
		await Bun.write(join(sourceHome, "db", "copied-records"), "same database rows");
		const before = await readHostDescriptor(context(join(source, "installation"), sourceHome), dependencies);

		await mkdir(destinationHome, { recursive: true });
		await cp(join(sourceHome, "db"), join(destinationHome, "db"), { recursive: true });
		const after = await readHostDescriptor(context(join(destination, "installation"), destinationHome), dependencies);

		expect(after.hostId).not.toBe(before.hostId);
		expect(after.dataHomeId).not.toBe(before.dataHomeId);
	});

	test("requires the host token for health and identity reads", async () => {
		const app = new Hono();
		app.use(hostAuth("host-token"));
		app.get("/api/health", (c) => c.json({ ok: true }));
		app.get("/api/host-identity", (c) => c.json({ ok: true }));

		for (const path of ["/api/health", "/api/host-identity"]) {
			expect((await app.request(path)).status).toBe(401);
			expect((await app.request(path, { headers: { authorization: "Bearer host-token" } })).status).toBe(200);
		}
	});

	test("keeps unauthenticated local reads when no host token exists", async () => {
		const app = new Hono();
		app.use(hostAuth(null));
		app.get("/api/health", (c) => c.json({ ok: true }));

		expect((await app.request("/api/health")).status).toBe(200);
	});
});
