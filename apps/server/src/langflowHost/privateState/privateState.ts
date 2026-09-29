import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SidecarIdentity } from "../contracts";

const IdentitySchema = z.strictObject({
	dataHomeId: z.string().min(1),
	hostId: z.string().min(1),
	ownerId: z.string().min(1),
	instanceId: z.uuid(),
	manifestDigest: z.string().regex(/^[0-9a-f]{64}$/),
});

const NativeAuthenticationSchema = z.strictObject({
	identity: IdentitySchema,
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export class PrivateState {
	private constructor(readonly root: string) {}

	static async open(home: string) {
		const root = join(home, "langflow");
		for (const path of [root, join(root, "supervisor"), join(root, "data"), join(root, "secrets")]) {
			await mkdir(path, { recursive: true, mode: 0o700 });
			const metadata = await lstat(path);
			if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("unsafe_sidecar_directory");
			await chmod(path, 0o700);
		}
		return new PrivateState(root);
	}

	get lockDirectory() {
		return join(this.root, "supervisor");
	}

	get dataDirectory() {
		return join(this.root, "data");
	}

	authenticationFile(identity: SidecarIdentity) {
		return join(this.root, "secrets", `${identity.instanceId}.token`);
	}

	async nativeReservationAuthentication(identity: SidecarIdentity) {
		const path = join(this.root, "secrets", `${identity.instanceId}.native-reservations.json`);
		const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const metadata = await file.stat();
			if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.uid !== process.getuid?.()) {
				throw new Error("unsafe_sidecar_native_authentication");
			}
			const binding = NativeAuthenticationSchema.parse(JSON.parse(await file.readFile("utf8")));
			if (!isDeepStrictEqual(binding.identity, identity)) throw new Error("sidecar_native_identity_conflict");
			return {
				nativeReservationAuthenticationFile: join(
					this.root,
					"secrets",
					`${identity.instanceId}.native-reservations.token`,
				),
				nativeReservationAuthenticationSha256: binding.sha256,
			};
		} finally {
			await file.close();
		}
	}

	async read(): Promise<SidecarIdentity | null> {
		const path = join(this.lockDirectory, "process.json");
		const file = Bun.file(path);
		if (!(await file.exists())) return null;
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
			throw new Error("unsafe_sidecar_identity");
		}
		return IdentitySchema.parse(JSON.parse(await readFile(path, "utf8")));
	}

	async reserve(identity: SidecarIdentity) {
		const token = await open(this.authenticationFile(identity), "wx", 0o600);
		try {
			await token.writeFile(crypto.randomUUID() + crypto.randomUUID());
			await token.sync();
		} finally {
			await token.close();
		}
		const nativeToken = crypto.randomUUID() + crypto.randomUUID();
		const nativeStem = join(this.root, "secrets", `${identity.instanceId}.native-reservations`);
		for (const [path, bytes] of [
			[`${nativeStem}.token`, nativeToken],
			[`${nativeStem}.json`, JSON.stringify({ identity, sha256: createHash("sha256").update(nativeToken).digest("hex") })],
		] as const) {
			const file = await open(path, "wx", 0o600);
			try {
				await file.writeFile(bytes);
				await file.sync();
			} finally {
				await file.close();
			}
		}
		const temporary = join(this.lockDirectory, `${identity.instanceId}.next`);
		const file = await open(temporary, "wx", 0o600);
		try {
			await file.writeFile(JSON.stringify(identity));
			await file.sync();
		} finally {
			await file.close();
		}
		await rename(temporary, join(this.lockDirectory, "process.json"));
		for (const path of [join(this.root, "secrets"), this.lockDirectory]) {
			const directory = await open(path, "r");
			try {
				await directory.sync();
			} finally {
				await directory.close();
			}
		}
	}
}
