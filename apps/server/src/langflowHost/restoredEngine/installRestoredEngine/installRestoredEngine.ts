import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../langflowContracts";
import { runOciCommand, type OciRun } from "../../ociDriver/process/process";
import { withInstallContext } from "../components/context";
import { engineInstallIntent } from "../components/intent";
import { readEngineReceipt } from "../components/receipt";
import { runEngineRestoreHelper } from "../components/runHelper";
import { readEngineSource } from "../components/source";
import { createEngineDestination, inspectEngineDestination } from "../components/storage";
import { type RestoredEngineInput, RestoredEngineInputSchema, RestoredEngineReceiptSchema } from "../contracts";

export async function installRestoredEngine(
	input: RestoredEngineInput,
	options: { executable: string; signal: AbortSignal; run?: OciRun },
) {
	const parsed = RestoredEngineInputSchema.parse(input);
	const run = options.run ?? ((args) => runOciCommand(options.executable, args));
	return withInstallContext(parsed, async (ctx) => {
		options.signal.throwIfAborted();
		const source = await readEngineSource(ctx, parsed);
		const intent = await engineInstallIntent(ctx, parsed, source);
		const intentBytes = JSON.stringify(intent);
		const intentId = protocolDigest(intentBytes);
		const priorIntent = ctx.objects.findBinding("intent");
		if (priorIntent !== null && (priorIntent !== intentId || ctx.objects.read(priorIntent) !== intentBytes))
			throw new Error("restored_engine_intent_conflict");
		const volumes = await inspectEngineDestination(run, intent);
		if (priorIntent === null && volumes.some((volume) => volume.state !== "absent"))
			throw new Error("restored_engine_target_exists");
		options.signal.throwIfAborted();
		const priorReceipt = ctx.objects.findBinding("installation");
		if (priorReceipt !== null && volumes.some((volume) => volume.state !== "found"))
			throw new Error("restored_engine_destination_missing");
		ctx.objects.bind("intent", ctx.objects.write(intentBytes));
		if (priorReceipt === null) {
			await createEngineDestination(run, intent);
			await inspectEngineDestination(run, intent);
			await ctx.assertClosed();
			options.signal.throwIfAborted();
			await runEngineRestoreHelper(run, { intent, intentBytes, payload: source.payload, mode: "install" });
		}
		options.signal.throwIfAborted();
		const destination = await runEngineRestoreHelper(run, { intent, intentBytes, payload: source.payload, mode: "verify" });
		const finalVolumes = await inspectEngineDestination(run, intent);
		if (finalVolumes.some((volume) => volume.state !== "found"))
			throw new Error("restored_engine_destination_missing");
		await ctx.assertClosed();
		options.signal.throwIfAborted();
		const record = RestoredEngineReceiptSchema.parse({ version: 1, intent, destination });
		if (priorReceipt !== null) {
			const prior = readEngineReceipt(ctx, priorReceipt);
			if (!isDeepStrictEqual(prior.record, record)) throw new Error("restored_engine_replay_conflict");
			return prior;
		}
		const receiptId = ctx.objects.write(JSON.stringify(record));
		ctx.objects.bind("installation", receiptId);
		return readEngineReceipt(ctx, receiptId);
	});
}
