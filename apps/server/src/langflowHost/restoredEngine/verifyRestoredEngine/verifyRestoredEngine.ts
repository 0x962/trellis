import { isDeepStrictEqual } from "node:util";
import { runOciCommand, type OciRun } from "../../ociDriver/process/process";
import { withInstallContext } from "../components/context";
import { engineInstallIntent } from "../components/intent";
import { readEngineReceipt } from "../components/receipt";
import { runEngineRestoreHelper } from "../components/runHelper";
import { readEngineSource } from "../components/source";
import { inspectEngineDestination } from "../components/storage";
import { type RestoredEngineInput, RestoredEngineInputSchema } from "../contracts";

export async function verifyRestoredEngine(
	input: RestoredEngineInput,
	receiptId: string,
	options: { executable: string; signal: AbortSignal; run?: OciRun },
) {
	const parsed = RestoredEngineInputSchema.parse(input);
	const run = options.run ?? ((args) => runOciCommand(options.executable, args));
	return withInstallContext(parsed, async (ctx) => {
		options.signal.throwIfAborted();
		const prior = readEngineReceipt(ctx, receiptId);
		const source = await readEngineSource(ctx, parsed);
		const intent = await engineInstallIntent(ctx, parsed, source);
		if (!isDeepStrictEqual(intent, prior.record.intent)) throw new Error("restored_engine_verification_scope_conflict");
		const volumes = await inspectEngineDestination(run, intent);
		if (volumes.some((volume) => volume.state !== "found")) throw new Error("restored_engine_destination_missing");
		const intentBytes = ctx.objects.read(prior.record.destination.intentDigest);
		const destination = await runEngineRestoreHelper(run, { intent, intentBytes, payload: source.payload, mode: "verify" });
		if (!isDeepStrictEqual(destination, prior.record.destination)) throw new Error("restored_engine_destination_changed");
		const finalVolumes = await inspectEngineDestination(run, intent);
		if (finalVolumes.some((volume) => volume.state !== "found"))
			throw new Error("restored_engine_destination_missing");
		await ctx.assertClosed();
		options.signal.throwIfAborted();
		return prior;
	});
}
