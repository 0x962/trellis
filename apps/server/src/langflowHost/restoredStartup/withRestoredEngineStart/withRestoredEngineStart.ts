import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { LangflowSidecarManifestV1 } from "../../../../../../integrations/langflow/package-probe/sidecarManifest";
import { assertHomeLock, type HomeLock, lockHome, withHomeLock } from "../../../homeLock";
import { protocolDigest } from "../../../langflowContracts";
import type { LiveOwnership, SidecarIdentity } from "../../contracts";
import type { OciRun } from "../../ociDriver/process/process";
import type { EngineInstallIntent } from "../../restoredEngine";
import { engineInstallIntent } from "../../restoredEngine/components/intent";
import { readEngineReceipt } from "../../restoredEngine/components/receipt";
import { runEngineRestoreHelper } from "../../restoredEngine/components/runHelper";
import { readEngineSource } from "../../restoredEngine/components/source";
import { inspectEngineDestination } from "../../restoredEngine/components/storage";
import { assertStartupClosed, restoredStartupContext } from "../components/context";
import type { RestoredEngineStartup } from "../contracts";

const scopeBrand = Symbol("restored-start");
export type RestoredStartScope = { readonly [scopeBrand]: true };
const scopes = new WeakMap<RestoredStartScope, {
	identity: SidecarIdentity; intent: EngineInstallIntent; assertHeld(): void;
}>();
export type RestoredStartBinding = {
	identity: SidecarIdentity; privateRoot: string; imageConfigDigest: string; manifest: LangflowSidecarManifestV1;
};
export type RestoredDriverStart = {
	startup: RestoredEngineStartup;
	supervisorLock: HomeLock;
	identity: SidecarIdentity;
	manifest: LangflowSidecarManifestV1;
};

export function assertRestoredStartScope(scope: RestoredStartScope, binding: RestoredStartBinding) {
	const active = scopes.get(scope);
	if (!active) throw new Error("restored_startup_scope_unavailable");
	active.assertHeld();
	if (!isDeepStrictEqual(active.identity, binding.identity) ||
		active.intent.target.privateRoot !== binding.privateRoot ||
		active.intent.package.imageConfigDigest !== binding.imageConfigDigest ||
		active.intent.package.manifestDigest !== protocolDigest(JSON.stringify(binding.manifest)))
		throw new Error("restored_startup_scope_conflict");
	return structuredClone(active.intent.capture.secret);
}

export function assertRestoredReservation(scope: RestoredStartScope, identity: SidecarIdentity, manifest: LangflowSidecarManifestV1, home: string) {
	const active = scopes.get(scope);
	if (!active) throw new Error("restored_startup_scope_unavailable");
	assertRestoredStartScope(scope, { identity, manifest, privateRoot: join(home, "langflow"),
		imageConfigDigest: active.intent.package.imageConfigDigest });
}

export async function withRestoredEngineStart(
	input: RestoredDriverStart & { privateRoot: string; imageConfigDigest: string; run: OciRun },
	operation: (scope: RestoredStartScope) => Promise<LiveOwnership>,
): Promise<LiveOwnership> {
	const { startup } = input;
	const ctx = restoredStartupContext(startup.input.home);
	const lockDirectory = join(ctx.privateRoot, "supervisor");
	return withHomeLock(startup.homeLock, ctx.identity.home, () =>
		withHomeLock(input.supervisorLock, lockDirectory, async () => {
			const dispatchLock = lockHome(ctx.store.directory, "restore", null);
			try {
				const assertHeld = () => {
					assertHomeLock(startup.homeLock, ctx.identity.home);
					assertHomeLock(input.supervisorLock, lockDirectory);
					assertHomeLock(dispatchLock, ctx.store.directory);
					assertStartupClosed(ctx, startup.input);
				};
				assertHeld();
				startup.signal.throwIfAborted();
				const context = { ...ctx, assertClosed: async () => assertHeld() };
				const installed = readEngineReceipt(context, startup.receiptId);
				if (ctx.objects.findBinding("initial-start-intent") !== null || ctx.objects.findBinding("initial-start") !== null)
					throw new Error("restored_startup_already_attempted");
				const process = await lstat(join(lockDirectory, "process.json")).catch((error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") return null;
					throw error;
				});
				if (process !== null) throw new Error("restored_startup_process_present");
				const source = await readEngineSource(context, startup.input);
				const intent = await engineInstallIntent(context, startup.input, source);
				if (!isDeepStrictEqual(intent, installed.record.intent) ||
					ctx.identity.hostId !== input.identity.hostId || ctx.identity.dataHomeId !== input.identity.dataHomeId ||
					input.identity.manifestDigest !== intent.package.manifestDigest ||
					protocolDigest(JSON.stringify(input.manifest)) !== intent.package.manifestDigest ||
					input.privateRoot !== intent.target.privateRoot || input.imageConfigDigest !== intent.package.imageConfigDigest)
					throw new Error("restored_startup_installation_conflict");
				const volumes = await inspectEngineDestination(input.run, intent);
				if (volumes.some((volume) => volume.state !== "found")) throw new Error("restored_startup_volume_missing");
				const destination = await runEngineRestoreHelper(input.run, {
					intent, intentBytes: ctx.objects.read(installed.record.destination.intentDigest),
					payload: source.payload, mode: "verify",
				});
				if (!isDeepStrictEqual(destination, installed.record.destination)) throw new Error("restored_startup_bytes_changed");
				const currentVolumes = await inspectEngineDestination(input.run, intent);
				if (currentVolumes.some((volume) => volume.state !== "found")) throw new Error("restored_startup_volume_missing");
				assertHeld();
				startup.signal.throwIfAborted();
				const association = {
					version: 1, installationReceiptId: installed.receiptId, identity: input.identity,
					block: intent.block, beforeStart: destination,
				};
				const associationId = ctx.objects.write(JSON.stringify(association));
				ctx.objects.bind("initial-start-intent", associationId);
				const scope = Object.freeze({ [scopeBrand]: true as const });
				scopes.set(scope, { identity: structuredClone(input.identity), intent, assertHeld });
				try {
					const observation = await operation(scope);
					assertHeld();
					if (!isDeepStrictEqual(observation.identity, input.identity)) throw new Error("restored_startup_observation_conflict");
					ctx.objects.bind("initial-start", ctx.objects.write(JSON.stringify({ associationId, observation })));
					return observation;
				} finally {
					scopes.delete(scope);
				}
			} finally {
				dispatchLock.release();
			}
		}),
	);
}
