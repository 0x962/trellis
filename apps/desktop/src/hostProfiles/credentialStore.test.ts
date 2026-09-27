import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostCredentialStore, type SecureStorage } from "./credentialStore.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const installationHome = async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-host-credentials-"));
	directories.push(directory);
	return directory;
};

const secureStorage = (available = true): SecureStorage => ({
	available: () => available,
	encrypt: (value) => Buffer.from(value).map((byte) => byte ^ 0x5a),
	decrypt: (value) => Buffer.from(value.map((byte) => byte ^ 0x5a)).toString(),
});

test("persists only encrypted credential bytes", async () => {
	const home = await installationHome();
	const store = createHostCredentialStore(home, secureStorage());
	const credential = { kind: "private-key" as const, privateKey: "PRIVATE KEY SECRET", passphrase: "PASSPHRASE" };

	const saved = await store.save({ credential, persistence: "secure" });
	const file = await readFile(join(home, "host-credentials.json"), "utf8");

	expect(file).not.toContain(credential.privateKey);
	expect(file).not.toContain(credential.passphrase);
	expect(await store.read(saved.reference)).toEqual(credential);
});

test("serializes concurrent credential saves", async () => {
	const home = await installationHome();
	const first = createHostCredentialStore(home, secureStorage());
	const second = createHostCredentialStore(home, secureStorage());

	const saved = await Promise.all([
		first.save({ credential: { kind: "password", password: "first" }, persistence: "secure" }),
		second.save({ credential: { kind: "password", password: "second" }, persistence: "secure" }),
	]);

	expect(await first.read(saved[0].reference)).toEqual({ kind: "password", password: "first" });
	expect(await first.read(saved[1].reference)).toEqual({ kind: "password", password: "second" });
});

test("refuses plaintext persistence when secure storage is unavailable", async () => {
	const home = await installationHome();
	const store = createHostCredentialStore(home, secureStorage(false));

	await expect(
		store.save({ credential: { kind: "password", password: "secret" }, persistence: "secure" }),
	).rejects.toThrow("Secure credential storage is unavailable. Use a session-only credential.");

	expect(existsSync(join(home, "host-credentials.json"))).toBe(false);
});

test("keeps an explicit session credential in memory only", async () => {
	const home = await installationHome();
	const store = createHostCredentialStore(home, secureStorage(false));
	const credential = { kind: "token" as const, token: "session secret" };

	const saved = await store.save({ credential, persistence: "session" });

	expect(await store.read(saved.reference)).toEqual(credential);
	expect(existsSync(join(home, "host-credentials.json"))).toBe(false);
	expect(await createHostCredentialStore(home, secureStorage(false)).read(saved.reference)).toBeNull();
});

test("does not put a secret in a decryption error", async () => {
	const home = await installationHome();
	const first = createHostCredentialStore(home, secureStorage());
	const saved = await first.save({
		credential: { kind: "private-key", privateKey: "PRIVATE KEY SECRET" },
		persistence: "secure",
	});
	const broken: SecureStorage = {
		available: () => true,
		encrypt: (value) => Buffer.from(value),
		decrypt: () => {
			throw new Error("PRIVATE KEY SECRET");
		},
	};

	await expect(createHostCredentialStore(home, broken).read(saved.reference)).rejects.toThrow(
		"The stored host credential cannot be read.",
	);
});

test("does not put a secret in an encryption error", async () => {
	const home = await installationHome();
	const broken: SecureStorage = {
		available: () => true,
		encrypt: () => {
			throw new Error("PRIVATE KEY SECRET");
		},
		decrypt: (value) => value.toString(),
	};

	await expect(
		createHostCredentialStore(home, broken).save({
			credential: { kind: "private-key", privateKey: "PRIVATE KEY SECRET" },
			persistence: "secure",
		}),
	).rejects.toThrow("The host credential cannot be saved.");
});
