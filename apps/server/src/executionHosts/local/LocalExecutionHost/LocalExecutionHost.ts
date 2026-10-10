import type { AccountHarness } from "@trellis/api";
import type { ExecutionHost, HostBinding } from "@trellis/runtime-protocol/execution";
import type { HarnessDescriptor, HarnessStartInput } from "../../../agents/harnessHost/types.ts";
import type { nativeWorkspace } from "../../../agents/native/workspace.ts";
import type { ExecutionEnvironment } from "../../../executionEnvironment";
import type { JobsLog } from "../../../jobs.ts";
import { createLocalNativeConnection, type LocalNativeConnection } from "../LocalNativeConnection";
import { localControl } from "./components/localControl.ts";
import { localFiles } from "./components/localFiles.ts";
import { localInput } from "./components/localInput.ts";
import { localLaunch } from "./components/localLaunch.ts";
import { localObserve } from "./components/localObserve.ts";
import { localPrepare } from "./components/localPrepare.ts";

// The execution host of the machine the server runs on.
//
// `binding` comes from the hosts registry row of the local host and from the
// single control row: `hostId` is the id of that registry row, `controlId`
// is the id of the control row, and `controllerOwnerEpoch` is the epoch of
// the controller that holds it. Every operation that takes a target checks
// the target against this binding before any socket or file system work.
//
// The host keeps the agent environment of today: the login environment of
// the host, the account profile of the run and the six attempt values go
// into the launch on this side of the contract. A contract value carries
// only the attempt values.

export type LocalPrepareInput = HarnessStartInput & {
	token: string;
	// The provider session the launch resumes.
	sessionId?: string;
	// The account of the run, or null for a run without one. A run without an
	// account launches on the machine-wide default login of its harness.
	account: { harness: AccountHarness; profilePath: string } | null;
};
export type LocalPrepare = {
	input: LocalPrepareInput;
	descriptor: HarnessDescriptor;
	workspace: Parameters<typeof nativeWorkspace>[1];
};
export type LocalExecutionHost = ExecutionHost<LocalPrepare>;

export type LocalExecutionHostInput = {
	binding: HostBinding;
	home: string;
	// The URL agents on this machine call the server on.
	localUrl: string;
	connection?: LocalNativeConnection;
	// The login environment of this host.
	env: () => Promise<ExecutionEnvironment>;
	log?: JobsLog;
};
export type LocalHostDeps = Omit<LocalExecutionHostInput, "connection"> & { connection: LocalNativeConnection };

export function createLocalExecutionHost(input: LocalExecutionHostInput): LocalExecutionHost {
	const deps: LocalHostDeps = { ...input, connection: input.connection ?? createLocalNativeConnection(input.home) };
	return {
		binding: deps.binding,
		...localObserve(deps),
		...localPrepare(deps),
		...localLaunch(deps),
		...localInput(deps),
		...localControl(deps),
		...localFiles(deps),
	};
}
