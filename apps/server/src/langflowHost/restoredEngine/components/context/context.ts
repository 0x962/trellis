import { lstat, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lockHome } from "../../../../homeLock";
import { DispatchStore } from "../../../dispatchGate/store/store";
import { LangflowHostControl } from "../../../hostControl";
import { ReceiptObjectStore } from "../../../objectStore";
import type { RestoredEngineInput } from "../../contracts";

export async function withInstallContext<T>(input: RestoredEngineInput, action: (ctx: InstallContext) => Promise<T>) {
	const identity = LangflowHostControl.readIdentity(input.home);
	if (identity.hostId !== input.hostId || identity.dataHomeId !== input.dataHomeId)
		throw new Error("restored_engine_target_identity_conflict");
	const homeLock = lockHome(identity.home, "restore", null);
	try {
		const privateRoot = join(identity.home, "langflow");
		for (const path of [privateRoot, join(privateRoot, "supervisor")]) {
			await mkdir(path, { recursive: true, mode: 0o700 });
			const stat = await lstat(path);
			if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() ||
				(stat.mode & 0o777) !== 0o700 || await realpath(path) !== path)
				throw new Error("restored_engine_private_directory_unsafe");
		}
		const supervisorLock = lockHome(join(privateRoot, "supervisor"), "restore", null);
		try {
			const controlDirectory = LangflowHostControl.directory(identity.home);
			const store = new DispatchStore(join(controlDirectory, "dispatch"), identity.dataHomeId);
			const dispatchLock = lockHome(store.directory, "restore", null);
			try {
				const objects = new ReceiptObjectStore(join(controlDirectory, "restored-engine"));
				const assertClosed = async () => {
					const state = store.read();
					if (state.block?.reason.kind !== "restore" || !isDeepStrictEqual(state.block, input.block) ||
						!isDeepStrictEqual(LangflowHostControl.readIdentity(identity.home), identity))
						throw new Error("restored_engine_block_changed");
					if (state.permits.some((entry) => entry.terminal === null)) throw new Error("restored_engine_effects_pending");
					if (state.captureGrants.some((entry) => entry.phase !== "revoked")) throw new Error("restored_engine_capture_pending");
					const processFile = await lstat(join(privateRoot, "supervisor", "process.json")).catch((error: NodeJS.ErrnoException) => {
						if (error.code === "ENOENT") return null;
						throw error;
					});
					if (processFile !== null) throw new Error("restored_engine_process_record_present");
				};
				await assertClosed();
				return await action({ identity, privateRoot, objects, assertClosed });
			} finally {
				dispatchLock.release();
			}
		} finally {
			supervisorLock.release();
		}
	} finally {
		homeLock.release();
	}
}

export type InstallContext = {
	identity: ReturnType<typeof LangflowHostControl.readIdentity>;
	privateRoot: string;
	objects: ReceiptObjectStore;
	assertClosed(): Promise<void>;
};
