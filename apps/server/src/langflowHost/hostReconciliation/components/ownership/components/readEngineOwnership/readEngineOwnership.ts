import type { readHeldEngine } from "../../../engine";
import type { readActiveOwnership } from "../readActiveOwnership";

export async function readEngineOwnership(
	records: Awaited<ReturnType<typeof readActiveOwnership>>,
	engine: Awaited<ReturnType<typeof readHeldEngine>>,
) {
	const receipts = [];
	for (const row of records) receipts.push(await engine.readAuthority(row.executionId));
	return receipts;
}
