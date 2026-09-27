import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HostCredentialReferenceSchema, type HostCredentialReference } from "@trellis/api";
import { writeAtomicJson } from "./atomicJson.ts";
import { serializerFor } from "./serialize.ts";

export type HostCredential =
	| { kind: "password"; password: string }
	| { kind: "private-key"; privateKey: string; passphrase?: string }
	| { kind: "token"; token: string };

export type SecureStorage = {
	available: () => boolean;
	encrypt: (value: string) => Buffer;
	decrypt: (value: Buffer) => string;
};

type CredentialPersistence = "secure" | "session";
type StoredCredentials = { version: 1; credentials: Record<string, string> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnly = (value: Record<string, unknown>, keys: string[]) =>
	Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);

const parseCredential = (value: unknown): HostCredential => {
	if (!isRecord(value)) throw new Error("The host credential is invalid.");
	if (value.kind === "password" && hasOnly(value, ["kind", "password"]) && typeof value.password === "string") {
		if (value.password.length > 0) return { kind: value.kind, password: value.password };
	}
	if (value.kind === "token" && hasOnly(value, ["kind", "token"]) && typeof value.token === "string") {
		if (value.token.length > 0) return { kind: value.kind, token: value.token };
	}
	if (
		value.kind === "private-key" &&
		Object.keys(value).every((key) => ["kind", "privateKey", "passphrase"].includes(key)) &&
		"privateKey" in value &&
		typeof value.privateKey === "string" &&
		value.privateKey.length > 0 &&
		(value.passphrase === undefined || typeof value.passphrase === "string")
	)
		return value.passphrase === undefined
			? { kind: value.kind, privateKey: value.privateKey }
			: { kind: value.kind, privateKey: value.privateKey, passphrase: value.passphrase };
	throw new Error("The host credential is invalid.");
};

export type HostCredentialStore = {
	save: (input: {
		reference?: HostCredentialReference;
		credential: HostCredential;
		persistence: CredentialPersistence;
	}) => Promise<{ reference: HostCredentialReference; persistence: CredentialPersistence }>;
	read: (reference: HostCredentialReference) => Promise<HostCredential | null>;
	remove: (reference: HostCredentialReference) => Promise<void>;
};

const readStored = async (path: string): Promise<StoredCredentials> => {
	if (!existsSync(path)) return { version: 1, credentials: {} };
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(path, "utf8"));
	} catch {
		throw new Error("The stored host credentials are invalid.");
	}
	if (
		!isRecord(parsed) ||
		!hasOnly(parsed, ["version", "credentials"]) ||
		parsed.version !== 1 ||
		!isRecord(parsed.credentials)
	)
		throw new Error("The stored host credentials are invalid.");
	for (const [reference, encrypted] of Object.entries(parsed.credentials)) {
		if (!HostCredentialReferenceSchema.safeParse(reference).success || typeof encrypted !== "string")
			throw new Error("The stored host credentials are invalid.");
	}
	return { version: 1, credentials: parsed.credentials as Record<string, string> };
};

export const createHostCredentialStore = (installationHome: string, secureStorage: SecureStorage): HostCredentialStore => {
	const path = join(installationHome, "host-credentials.json");
	const session = new Map<HostCredentialReference, HostCredential>();
	const serialize = serializerFor(path);

	return {
		save: (input) =>
			serialize(async () => {
				const reference = HostCredentialReferenceSchema.parse(input.reference ?? randomUUID());
				if (input.persistence !== "secure" && input.persistence !== "session")
					throw new Error("Choose secure or session-only credential storage.");
				const credential = parseCredential(input.credential);
				const stored = await readStored(path);
				if (input.persistence === "session") {
					session.set(reference, credential);
					if (stored.credentials[reference] !== undefined) {
						delete stored.credentials[reference];
						await writeAtomicJson(path, stored);
					}
					return { reference, persistence: input.persistence };
				}
				if (!secureStorage.available())
					throw new Error("Secure credential storage is unavailable. Use a session-only credential.");
				try {
					stored.credentials[reference] = secureStorage.encrypt(JSON.stringify(credential)).toString("base64");
				} catch {
					throw new Error("The host credential cannot be saved.");
				}
				await writeAtomicJson(path, stored);
				session.delete(reference);
				return { reference, persistence: input.persistence };
			}),
		read: (reference) =>
			serialize(async () => {
				const parsedReference = HostCredentialReferenceSchema.parse(reference);
				const inSession = session.get(parsedReference);
				if (inSession !== undefined) return inSession;
				const encrypted = (await readStored(path)).credentials[parsedReference];
				if (encrypted === undefined) return null;
				try {
					const decrypted = secureStorage.decrypt(Buffer.from(encrypted, "base64"));
					return parseCredential(JSON.parse(decrypted));
				} catch {
					throw new Error("The stored host credential cannot be read.");
				}
			}),
		remove: (reference) =>
			serialize(async () => {
				const parsedReference = HostCredentialReferenceSchema.parse(reference);
				session.delete(parsedReference);
				const stored = await readStored(path);
				if (stored.credentials[parsedReference] === undefined) return;
				delete stored.credentials[parsedReference];
				await writeAtomicJson(path, stored);
			}),
	};
};
