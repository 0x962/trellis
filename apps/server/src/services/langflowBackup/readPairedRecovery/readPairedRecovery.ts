import type { LangflowHostControl } from "../../../langflowHost";
import { CaptureGrantSchema } from "../../../langflowHost/captureAuthority/schema/schema";
import { PairedJournal, PairedRequestSchema, pairedStages } from "../pairedJournal";

export async function readPairedRecovery(ctx: { control: LangflowHostControl }, input: { snapshotId: string }) {
	const journal = await PairedJournal.open(ctx.control, input.snapshotId);
	const request = PairedRequestSchema.parse(await journal.read("request"));
	const stages = Object.fromEntries(await Promise.all(pairedStages.map(async (stage) => [stage, await journal.read(stage)])));
	const gate = ctx.control.gate.read();
	const captureGrants = gate.captureGrants.filter((record) => {
		const grant = CaptureGrantSchema.parse(JSON.parse(record.grantBytes));
		return grant.snapshotId === input.snapshotId;
	});
	return { request, stages, block: gate.block, captureGrants, pendingPermits: gate.permits.filter((entry) => !entry.terminal) };
}
