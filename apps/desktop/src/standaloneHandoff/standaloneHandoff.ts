import { homedir } from "node:os";
import { join } from "node:path";
import { inspectStandaloneCandidate } from "./inspectStandaloneCandidate.ts";
import { type HandoffOperations, handoffOperations } from "./operations.ts";
import type { StandaloneCandidate, StandaloneHandoffResult } from "./types.ts";

export type { StandaloneHandoffResult } from "./types.ts";
export const handoffStandalone = async (
	candidate: StandaloneCandidate,
	resources: string,
	operations: HandoffOperations = handoffOperations,
): Promise<StandaloneHandoffResult> => {
	const verify = async () => {
		const current = await inspectStandaloneCandidate(candidate.home, operations);
		if (current.home !== candidate.home || JSON.stringify(current.service) !== JSON.stringify(candidate.service))
			throw new Error("The data home owner changed after confirmation. Inspect it again.");
	};
	await verify();
	let disabled = false;
	try {
		if (candidate.service) {
			await operations.disable(candidate.service.domain);
			disabled = true;
			await verify();
			await operations.bootout(candidate.service.domain);
			await operations.waitForExit(candidate.service.pid);
		}
		return await operations.prepare(resources, candidate);
	} catch (error) {
		const paths = `Backup: ${candidate.backupPath}\nMarker: ${join(candidate.home, "standalone-handoff-in-progress.json")}`;
		const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
		const restore = disabled
			? `\nThe standalone service remains disabled. After you stop any desktop host and review the retained backup/marker, restore its registration with:\nlaunchctl enable ${quote(`${candidate.service!.domain}/com.trellis.server`)}\nlaunchctl bootstrap ${quote(candidate.service!.domain)} ${quote(join(homedir(), "Library/LaunchAgents/com.trellis.server.plist"))}`
			: "";
		throw new Error(`${(error as Error).message}\n${paths}${restore}`);
	}
};
