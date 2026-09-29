import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	DispatchGate,
	DispatchReceiptArchive,
	type HostControlIdentity,
	LangflowHostControl,
} from "../../langflowHost";
import { publicationDispatch } from "./publicationDispatch";

export const publicationArchiveFixture = (root: string) => {
	const home = join(root, "home");
	mkdirSync(home);
	const identity: HostControlIdentity = {
		version: 1,
		home,
		hostId: crypto.randomUUID(),
		dataHomeId: crypto.randomUUID(),
	};
	const directory = LangflowHostControl.directory(home);
	mkdirSync(directory, { mode: 0o700 });
	let archive: DispatchReceiptArchive;
	const gate = DispatchGate.create({
		directory: join(directory, "dispatch"),
		dataHomeId: identity.dataHomeId,
		evidence: {
			readTerminal: (permit, id) => archive.readTerminal(permit, id),
			withReconciliation: async () => {
				throw new Error("unexpected_reconciliation");
			},
		},
	});
	archive = DispatchReceiptArchive.open({ identity, gate });
	return { gate, archive, dispatch: publicationDispatch(gate, archive) };
};
