import {
	closeSync,
	constants,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DispatchEffects } from "../dispatchEffects";
import { type DispatchEvidence, DispatchGate } from "../dispatchGate";
import { DispatchStore } from "../dispatchGate/store/store";

const IdentitySchema = z.strictObject({
	version: z.literal(1),
	home: z.string().min(1),
	hostId: z.uuid(),
	dataHomeId: z.uuid(),
});
export type HostControlIdentity = z.infer<typeof IdentitySchema>;
export type HostRecoveryState =
	| { state: "unavailable"; generation: null }
	| { state: "open" | "blocked"; generation: number };
type ControlInput = { home: string; evidence: DispatchEvidence };

export class LangflowHostControl {
	private constructor(
		readonly identity: HostControlIdentity,
		readonly gate: DispatchGate,
	) {}

	static directory(home: string) {
		return `${realpathSync(home)}.langflow-authority`;
	}

	static create(input: ControlInput) {
		const home = realpathSync(input.home);
		const directory = LangflowHostControl.directory(home);
		mkdirSync(directory, { mode: 0o700 });
		const identity: HostControlIdentity = {
			version: 1,
			home,
			hostId: crypto.randomUUID(),
			dataHomeId: crypto.randomUUID(),
		};
		const fd = openSync(join(directory, "identity.json"), "wx", 0o600);
		try {
			writeFileSync(fd, JSON.stringify(identity));
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		const gate = DispatchGate.create({
			directory: join(directory, "dispatch"),
			dataHomeId: identity.dataHomeId,
			evidence: input.evidence,
			initialBlock: { requestId: crypto.randomUUID(), reason: { kind: "initialize" } },
		});
		for (const path of [directory, dirname(directory)]) {
			const directoryFd = openSync(path, "r");
			try {
				fsyncSync(directoryFd);
			} finally {
				closeSync(directoryFd);
			}
		}
		return new LangflowHostControl(identity, gate);
	}

	static open(input: ControlInput) {
		const identity = LangflowHostControl.readIdentity(input.home);
		const gate = DispatchGate.open({
			directory: join(LangflowHostControl.directory(input.home), "dispatch"),
			dataHomeId: identity.dataHomeId,
			evidence: input.evidence,
		});
		return new LangflowHostControl(identity, gate);
	}

	static openEffects(input: { home: string; readTerminal: DispatchEvidence["readTerminal"] }) {
		const identity = LangflowHostControl.readIdentity(input.home);
		const gate = DispatchEffects.openEffects({
			directory: join(LangflowHostControl.directory(input.home), "dispatch"),
			dataHomeId: identity.dataHomeId,
			readTerminal: input.readTerminal,
		});
		return { identity, gate };
	}

	static recovery(home: string): HostRecoveryState {
		const directory = LangflowHostControl.directory(home);
		if (!existsSync(directory)) return { state: "unavailable", generation: null };
		const identity = LangflowHostControl.readIdentity(home);
		const state = new DispatchStore(join(directory, "dispatch"), identity.dataHomeId).read();
		return { state: state.block ? "blocked" : "open", generation: state.generation };
	}

	private static readIdentity(home: string) {
		const fd = openSync(
			join(LangflowHostControl.directory(home), "identity.json"),
			constants.O_RDONLY | constants.O_NOFOLLOW,
		);
		try {
			const identity = IdentitySchema.parse(JSON.parse(readFileSync(fd, "utf8")));
			if (identity.home !== realpathSync(home)) throw new Error("dispatch_control_home_mismatch");
			return identity;
		} finally {
			closeSync(fd);
		}
	}
}
