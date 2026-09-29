export type EffectBinding = {
	effectId: string;
	kind: "admission" | "publication" | "recovery" | "native-dispatch" | "engine-delivery" | "decision" | "cancellation";
	executionId: string | null;
	attemptId: string | null;
	jobId: string | null;
	requestId: string;
	payloadDigest: string;
};

export type DispatchPermit = {
	id: string;
	dataHomeId: string;
	generation: number;
	binding: EffectBinding;
};

export type BlockReason =
	| {
			kind: "restore";
			directory: string;
			snapshotId: string;
			sourceDataHomeId: string;
			manifestDigest: string;
	  }
	| { kind: "capture"; snapshotId: string }
	| { kind: "initialize" };

export type DispatchBlock = {
	id: string;
	dataHomeId: string;
	generation: number;
	requestId: string;
	reason: BlockReason;
};

export type TerminalReceipt = {
	id: string;
	permit: DispatchPermit;
	outcome: "completed" | "refused" | "cancelled";
};

export type ReconciliationReceipt = {
	id: string;
	block: DispatchBlock;
	packageDigest: string;
	trellisDatabaseReceiptId: string;
	engineDatabaseReceiptId: string;
	secretReceiptId: string;
	ownershipReceiptId: string;
	nativeAttemptsReceiptId: string;
	stopObligationsReceiptId: string;
	snapshotSealReceiptId: string | null;
};

export type DispatchEvidence = {
	readTerminal(permit: DispatchPermit, receiptId: string): Promise<TerminalReceipt>;
	withReconciliation(
		block: DispatchBlock,
		receiptId: string,
		commit: (receipt: ReconciliationReceipt) => void,
	): Promise<void>;
};

export type DispatchState = {
	version: 1;
	dataHomeId: string;
	generation: number;
	block: DispatchBlock | null;
	permits: { permit: DispatchPermit; terminal: TerminalReceipt | null }[];
	reconciliations: ReconciliationReceipt[];
};
