import { isDeepStrictEqual } from "node:util";
import { LangflowHostControl } from "../../../langflowHost";
import { CaptureGrantSchema } from "../../../langflowHost/captureAuthority/schema/schema";
import type { TrellisSealInput } from "../pairedContracts";

export function assertCaptureGate(home: string, input: TrellisSealInput) {
	const control = LangflowHostControl.openCapture({ home });
	const state = control.gate.read();
	if (control.identity.hostId !== input.metadata.sourceHostId ||
		control.identity.dataHomeId !== input.metadata.sourceDataHomeId ||
		!isDeepStrictEqual(state.block, input.block) || state.permits.some((entry) => entry.terminal === null))
		throw new Error("paired_worker_capture_not_drained");
	const active = state.captureGrants.some((record) => {
		if (record.phase !== "active" || record.receipt?.state !== "active") return false;
		const grant = CaptureGrantSchema.parse(JSON.parse(record.grantBytes));
		return isDeepStrictEqual(grant.block, input.block) &&
			grant.identity.hostId === control.identity.hostId && grant.identity.dataHomeId === control.identity.dataHomeId &&
			grant.snapshotId === input.metadata.snapshotId && grant.boundaryReceiptId === input.metadata.boundary.receiptId;
	});
	if (!active) throw new Error("paired_worker_capture_grant_unavailable");
}
