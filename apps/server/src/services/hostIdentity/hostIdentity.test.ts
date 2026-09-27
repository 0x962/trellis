import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostIdentityPaths, prepareDescribe, readHostDescriptor } from "./hostIdentity.ts";
import { readIdentity } from "./identityStore/index.ts";
import { initializeHostIdentityFiles } from "./initializeHostIdentityFiles/index.ts";

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
	releaseId: "release-1",
	log: () => undefined,
});

const dependencies = {
	readIdentity,
	runtimeProtocol: 13,
	platform: "linux" as const,
	arch: "x64" as const,
	capabilities: ["host-identity"],
};

describe("host identity", () => {
	test("keeps the installation and data-home identities", async () => {
		const base = await root();
		const ctx = context(join(base, "installation"), join(base, "data"));
		await initializeHostIdentityFiles(ctx);
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
		const firstContext = context(installationHome, join(base, "data-a"));
		const secondContext = context(installationHome, join(base, "data-b"));
		await initializeHostIdentityFiles(firstContext);
		await initializeHostIdentityFiles(secondContext);
		const first = await readHostDescriptor(firstContext, dependencies);
		const second = await readHostDescriptor(secondContext, dependencies);

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
		const sourceContext = context(join(source, "installation"), sourceHome);
		await initializeHostIdentityFiles(sourceContext);
		const before = await readHostDescriptor(sourceContext, dependencies);

		await mkdir(destinationHome, { recursive: true });
		await cp(join(sourceHome, "db"), join(destinationHome, "db"), { recursive: true });
		const destinationContext = context(join(destination, "installation"), destinationHome);
		await initializeHostIdentityFiles(destinationContext);
		const after = await readHostDescriptor(destinationContext, dependencies);

		expect(after.hostId).not.toBe(before.hostId);
		expect(after.dataHomeId).not.toBe(before.dataHomeId);
	});

	test("does not create identity files during a descriptor read", async () => {
		const base = await root();
		const ctx = context(join(base, "installation"), join(base, "data"));

		await expect(readHostDescriptor(ctx, dependencies)).rejects.toMatchObject({ code: "ENOENT" });
		for (const path of Object.values(hostIdentityPaths(ctx))) expect(existsSync(path)).toBe(false);
	});

	test("logs the installation and data-home identities after a read", async () => {
		const base = await root();
		const records: Array<{ message: string; fields: Record<string, unknown> | undefined }> = [];
		const ctx = {
			...context(join(base, "installation"), join(base, "data")),
			log: (message: string, fields?: Record<string, unknown>) => records.push({ message, fields }),
		};
		await initializeHostIdentityFiles(ctx);

		const descriptor = await prepareDescribe(ctx, {});

		expect(records).toEqual([
			{ message: "host identity", fields: { hostId: descriptor.hostId, dataHomeId: descriptor.dataHomeId } },
		]);
	});
});
