export type RuntimeCaptureRootKind = "worktree" | "git" | "common" | "conversation";
export type RuntimeCaptureRootSourceKind =
	| "workspace"
	| "git-directory"
	| "common-directory"
	| "account-profile"
	| "opencode-export";

export type RuntimeCaptureIdentity = {
	harness: string;
	accountId: string | null;
	profileId: string | null;
	agentRunId: string;
	attemptId: string;
	providerSessionId: string | null;
};

export type RuntimeLaunchCaptureProviderRoot = {
	sourceKind: "account-profile" | "opencode-export";
	path: string;
	excludedPaths: string[];
	externalLinks: { path: string; target: string }[];
};

export type RuntimeLaunchCaptureIdentity = Omit<RuntimeCaptureIdentity, "providerSessionId"> & {
	providerRoot: RuntimeLaunchCaptureProviderRoot | null;
};

export type RuntimeCaptureRequest = {
	captureId: string;
	snapshotId: string;
	hostId: string;
	dataHomeId: string;
	generation: number;
	blockId: string;
	identities: RuntimeCaptureIdentity[];
};

type RuntimeCaptureRootBase = {
	rootId: string;
	originalIdentity: string;
};

export type RuntimeCaptureRoot =
	| (RuntimeCaptureRootBase & {
			kind: "worktree";
			sourceKind: "workspace";
	  })
	| (RuntimeCaptureRootBase & {
			kind: "git";
			sourceKind: "git-directory";
			objectFormat: "sha1" | "sha256";
	  })
	| (RuntimeCaptureRootBase & {
			kind: "common";
			sourceKind: "common-directory";
			objectFormat: "sha1" | "sha256";
	  })
	| (RuntimeCaptureRootBase & {
			kind: "conversation";
			sourceKind: "account-profile" | "opencode-export";
			identity: RuntimeCaptureIdentity;
	  });

export type RuntimeCaptureBinding = RuntimeCaptureRequest & {
	workspaceId: string;
	roots: RuntimeCaptureRoot[];
};

export type RuntimeCaptureEntry =
	| {
			rootId: string;
			path: string;
			kind: "directory";
			mode: number;
	  }
	| {
			rootId: string;
			path: string;
			kind: "file";
			mode: number;
			size: number;
			sha256: string;
	  }
	| {
			rootId: string;
			path: string;
			kind: "symlink";
			target: string;
	  };

export type RuntimeCaptureInventory = {
	binding: RuntimeCaptureBinding;
	entries: RuntimeCaptureEntry[];
	unavailable: RuntimeCaptureUnavailable[];
};

export type RuntimeCaptureUnavailable = {
	identity: RuntimeCaptureIdentity;
	sourceKind: "account-profile" | "opencode-export";
	code: string;
	message: string;
};

export type RuntimeCaptureReadInput = {
	binding: RuntimeCaptureBinding;
	rootId: string;
	path: string;
};

export type RuntimeCaptureSealInput = {
	binding: RuntimeCaptureBinding;
	rootId: string;
	manifestSha256: string;
};

export type RuntimeCaptureSealReceipt = {
	schemaVersion: 1;
	kind: "trellis-runtime-capture-seal";
	binding: RuntimeCaptureBinding;
	rootId: string;
	manifestSha256: string;
};

export type RuntimeCaptureProducer = {
	binding: RuntimeCaptureBinding;
	inventory: (binding: RuntimeCaptureBinding, signal?: AbortSignal) => Promise<RuntimeCaptureInventory>;
	read: (input: RuntimeCaptureReadInput, signal?: AbortSignal) => AsyncIterable<Uint8Array>;
	seal: (input: RuntimeCaptureSealInput, signal?: AbortSignal) => Promise<Uint8Array>;
};

export type RuntimeCaptureAction<T> = (producer: RuntimeCaptureProducer) => Promise<T>;

export type RuntimeCaptureFrame =
	| { type: "binding"; binding: RuntimeCaptureBinding }
	| { type: "inventory"; binding: RuntimeCaptureBinding }
	| { type: "inventory-result"; inventory: RuntimeCaptureInventory }
	| { type: "read"; input: RuntimeCaptureReadInput }
	| { type: "data"; data: Uint8Array }
	| { type: "end" }
	| { type: "seal"; input: RuntimeCaptureSealInput }
	| { type: "receipt"; receipt: Uint8Array }
	| { type: "release" }
	| { type: "released" }
	| { type: "error"; code: string; message: string };
