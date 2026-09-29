import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../../langflowContracts";
import { EngineLeaseSchema } from "../../../engineReconciliation/schema/schema";
import { LangflowHostControl } from "../../../hostControl";
import type { HostReconciliationInput } from "../../contracts";

export async function readCurrentIdentity(home: string, input: HostReconciliationInput) {
	const identity = LangflowHostControl.readIdentity(home);
	const expected = input.observation.identity;
	if (
		identity.hostId !== expected.hostId || identity.dataHomeId !== expected.dataHomeId ||
		expected.dataHomeId !== input.block.dataHomeId ||
		protocolDigest(JSON.stringify(input.manifest)) !== expected.manifestDigest
	) throw new Error("host_reconciliation_identity_conflict");
	const path = join(identity.home, "langflow", "supervisor", "process.json");
	const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stat = await fd.stat();
		if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600)
			throw new Error("host_reconciliation_identity_unsafe");
		const sourceBytes = await fd.readFile("utf8");
		const saved = EngineLeaseSchema.shape.identity.parse(JSON.parse(sourceBytes));
		if (!isDeepStrictEqual(saved, expected)) throw new Error("host_reconciliation_instance_changed");
		return { identity, sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
	} finally {
		await fd.close();
	}
}
