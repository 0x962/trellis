import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	HostProfileAddInputSchema,
	HostProfileEditInputSchema,
	HostProfileListSchema,
	HostProfileRemoveInputSchema,
	HostProfileSchema,
	HostProfileTrustKeyInputSchema,
	type HostCredentialRef,
	type HostProfile,
	type HostProfileAddInput,
	type HostProfileEditInput,
	type HostProfileId,
	type HostProfileRemoveInput,
	type HostProfileTrustKeyInput,
	type SshHostKeyPin,
} from "@trellis/api";
import { writeAtomicJson } from "../atomicJson/index.ts";
import { operationQueueFor } from "../operationQueue/index.ts";

export type HostProfileStore = {
	list: () => Promise<HostProfile[]>;
	add: (input: HostProfileAddInput) => Promise<HostProfile>;
	edit: (input: HostProfileEditInput) => Promise<HostProfile>;
	trustKey: (input: HostProfileTrustKeyInput) => Promise<HostProfile>;
	remove: (input: HostProfileRemoveInput) => Promise<void>;
};

type Options = {
	disconnect: (id: HostProfileId) => Promise<void>;
	removeCredential: (reference: HostCredentialRef) => Promise<void>;
};

const readProfiles = async (path: string): Promise<HostProfile[]> => {
	let source: string;
	try {
		source = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	let stored: unknown;
	try {
		stored = JSON.parse(source);
	} catch {
		throw new Error("The stored host profiles are invalid.");
	}
	if (
		typeof stored !== "object" ||
		stored === null ||
		Array.isArray(stored) ||
		Object.keys(stored).some((key) => key !== "version" && key !== "profiles") ||
		!("version" in stored) ||
		!("profiles" in stored)
	)
		throw new Error("The stored host profiles are invalid.");
	const parsed = HostProfileListSchema.safeParse(stored.profiles);
	if (stored.version !== 1 || !parsed.success) throw new Error("The stored host profiles are invalid.");
	for (const profile of parsed.data) {
		if (profile.kind === "ssh") verifyHostKey(profile.hostKey);
	}
	return parsed.data;
};

const writeProfiles = (path: string, profiles: HostProfile[]) =>
	writeAtomicJson(path, { version: 1, profiles: HostProfileListSchema.parse(profiles) });

const findIndex = (profiles: HostProfile[], id: HostProfileId): number => {
	const index = profiles.findIndex((profile) => profile.id === id);
	if (index < 0) throw new Error("The host profile does not exist.");
	return index;
};

const resolveDataHomePath = async (path: string): Promise<string> => {
	const canonical = await realpath(path);
	if (!(await stat(canonical)).isDirectory()) throw new Error("The local data home must be a directory.");
	return canonical;
};

const verifyHostKey = (pin: SshHostKeyPin): SshHostKeyPin => {
	const publicKey = Buffer.from(pin.publicKey, "base64");
	if (publicKey.length < 4) throw new Error("The SSH host key is invalid.");
	const algorithmLength = publicKey.readUInt32BE(0);
	if (publicKey.length < 4 + algorithmLength || publicKey.subarray(4, 4 + algorithmLength).toString() !== pin.algorithm)
		throw new Error("The SSH host key algorithm does not match its public key.");
	const fingerprint = `SHA256:${createHash("sha256").update(publicKey).digest("base64").replace(/=+$/, "")}`;
	if (fingerprint !== pin.fingerprint) throw new Error("The SSH host key fingerprint does not match its public key.");
	return pin;
};

export const createHostProfileStore = (installationHome: string, options: Options): HostProfileStore => {
	const path = join(installationHome, "host-profiles.json");
	const enqueue = operationQueueFor(path);

	return {
		list: () => enqueue(() => readProfiles(path)),
		add: (input) =>
			enqueue(async () => {
				const parsed = HostProfileAddInputSchema.parse(input);
				let sanitized: HostProfile;
				if (parsed.kind === "ssh") {
					const { trustedHostKey, ...fields } = parsed;
					sanitized = HostProfileSchema.parse({
						...fields,
						id: randomUUID(),
						hostKey: verifyHostKey(trustedHostKey),
					});
				} else
					sanitized = HostProfileSchema.parse({
						...parsed,
						id: randomUUID(),
						dataHome: await resolveDataHomePath(parsed.dataHome),
					});
				const profiles = await readProfiles(path);
				await writeProfiles(path, [...profiles, sanitized]);
				return sanitized;
			}),
		edit: (input) =>
			enqueue(async () => {
				const parsed = HostProfileEditInputSchema.parse(input);
				const profiles = await readProfiles(path);
				const index = findIndex(profiles, parsed.id);
				const current = profiles[index]!;
				if (current.kind !== parsed.kind) throw new Error("A host profile cannot change its connection type.");
				const updated = HostProfileSchema.parse({
					...current,
					...parsed,
					...(parsed.kind === "local" && parsed.dataHome !== undefined
						? { dataHome: await resolveDataHomePath(parsed.dataHome) }
						: {}),
				});
				profiles[index] = updated;
				await writeProfiles(path, profiles);
				return updated;
			}),
		trustKey: (input) =>
			enqueue(async () => {
				const parsed = HostProfileTrustKeyInputSchema.parse(input);
				const profiles = await readProfiles(path);
				const index = findIndex(profiles, parsed.id);
				const current = profiles[index]!;
				if (current.kind !== "ssh") throw new Error("A local host profile has no SSH host key.");
				const updated = { ...current, hostKey: verifyHostKey(parsed.trustedHostKey) };
				profiles[index] = updated;
				await writeProfiles(path, profiles);
				return updated;
			}),
		remove: (input) =>
			enqueue(async () => {
				const parsed = HostProfileRemoveInputSchema.parse(input);
				const profiles = await readProfiles(path);
				const index = findIndex(profiles, parsed.id);
				const profile = profiles[index]!;
				await options.disconnect(profile.id);
				if (profile.kind === "ssh") await options.removeCredential(profile.credentialRef);
				profiles.splice(index, 1);
				await writeProfiles(path, profiles);
			}),
	};
};
