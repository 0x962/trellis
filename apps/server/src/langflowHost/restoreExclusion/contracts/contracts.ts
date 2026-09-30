import type { DispatchBlock } from "../../dispatchGate";
import type { HostControlIdentity } from "../../hostControl";

export type IsolatedRestoreInput = {
	home: string;
	hostId: string;
	dataHomeId: string;
	block: DispatchBlock;
};

export type IsolatedRestoreScope = {
	identity: HostControlIdentity;
	privateRoot: string;
	assertClosed(): Promise<void>;
};
