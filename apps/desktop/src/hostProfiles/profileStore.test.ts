import { afterEach, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostProfileStore } from "./profileStore.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const installationHome = async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-host-profiles-"));
	directories.push(directory);
	return directory;
};

const hostKey = (publicKey: string) => ({
	algorithm: "ssh-ed25519",
	publicKey,
	fingerprint: `SHA256:${createHash("sha256")
		.update(Buffer.from(publicKey, "base64"))
		.digest("base64")
		.replace(/=+$/, "")}`,
});

const sshInput = (label: string, allocatedPort: number) => ({
	kind: "ssh" as const,
	label,
	address: `${label.toLowerCase()}.example.com`,
	port: 22,
	username: "trellis",
	credentialRef: randomUUID(),
	credentialPersistence: "secure" as const,
	trustedHostKey: hostKey("AAAAC3NzaC1lZDI1NTE5AAAAIE5vdEFQcm9kdWN0aW9uS2V5"),
	allocatedPort,
	expectedHostId: null,
	expectedDataHomeId: null,
});

const storeFor = (home: string, disconnected: string[] = [], removedCredentials: string[] = []) =>
	createHostProfileStore(home, {
		disconnect: async (id) => {
			disconnected.push(id);
		},
		removeCredential: async (reference) => {
			removedCredentials.push(reference);
		},
	});

test("reads profiles without a host connection", async () => {
	const home = await installationHome();
	const store = storeFor(home);
	const added = await store.add(sshInput("Workshop", 24_521));

	const profiles = await storeFor(home).list();

	expect(profiles).toEqual([added]);
});

test("requires an existing directory for a local profile", async () => {
	const home = await installationHome();
	const store = storeFor(home);

	await expect(
		store.add({
			kind: "local",
			label: "This Mac",
			dataHome: join(home, "missing"),
			expectedHostId: null,
			expectedDataHomeId: null,
		}),
	).rejects.toThrow();

	expect(existsSync(join(home, "host-profiles.json"))).toBe(false);
});

test("serializes concurrent profile additions", async () => {
	const home = await installationHome();
	const first = storeFor(home);
	const second = storeFor(home);

	await Promise.all([first.add(sshInput("Workshop", 24_521)), second.add(sshInput("Office", 24_522))]);

	const profiles = await first.list();
	expect(profiles.map((profile) => profile.label).sort()).toEqual(["Office", "Workshop"]);
	expect(JSON.parse(await readFile(join(home, "host-profiles.json"), "utf8")).profiles).toHaveLength(2);
});

test("rejects external fields before it writes a profile", async () => {
	const home = await installationHome();
	const store = storeFor(home);

	await expect(store.add({ ...sshInput("Workshop", 24_521), token: "secret" } as never)).rejects.toThrow();

	expect(existsSync(join(home, "host-profiles.json"))).toBe(false);
});

test("rejects a host key with a mismatched fingerprint", async () => {
	const home = await installationHome();
	const store = storeFor(home);
	const input = sshInput("Workshop", 24_521);

	await expect(
		store.add({
			...input,
			trustedHostKey: { ...input.trustedHostKey, fingerprint: "SHA256:ZmFrZUZpbmdlcnByaW50Rm9yVGVzdHM" },
		}),
	).rejects.toThrow("The SSH host key fingerprint does not match its public key.");
});

test("changes an SSH host key only through the trust operation", async () => {
	const home = await installationHome();
	const store = storeFor(home);
	const profile = await store.add(sshInput("Workshop", 24_521));
	if (profile.kind !== "ssh") throw new Error("The fixture must create an SSH profile.");
	const trustedHostKey = {
		...hostKey("AAAAC3NzaC1lZDI1NTE5AAAAIEludGVncmF0aW9uVGVzdEtleQ=="),
	};

	await expect(store.edit({ id: profile.id, kind: "ssh", hostKey: trustedHostKey } as never)).rejects.toThrow();
	const updated = await store.trustKey({ id: profile.id, trustedHostKey });

	expect(updated).toMatchObject({ hostKey: trustedHostKey });
});

test("disconnects and removes credentials without deleting host data", async () => {
	const home = await installationHome();
	const dataHome = join(home, "remote-host-data");
	await mkdir(dataHome);
	await writeFile(join(dataHome, "kept.txt"), "host data");
	const disconnected: string[] = [];
	const removedCredentials: string[] = [];
	const store = storeFor(home, disconnected, removedCredentials);
	const profile = await store.add(sshInput("Workshop", 24_521));
	if (profile.kind !== "ssh") throw new Error("The fixture must create an SSH profile.");

	await store.remove({ id: profile.id });

	expect(disconnected).toEqual([profile.id]);
	expect(removedCredentials).toEqual([profile.credentialRef]);
	expect(await readFile(join(dataHome, "kept.txt"), "utf8")).toBe("host data");
	expect(await store.list()).toEqual([]);
});
