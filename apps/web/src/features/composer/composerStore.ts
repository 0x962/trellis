export type ComposerOptions = {
	// A status ref the composer starts with, from a group header.
	status?: string;
	// A parent ticket ref, from a ticket page.
	parent?: string;
};

// Skeleton for the web-table work item. The composer tests state the outcomes.
export const openComposer = (_options: ComposerOptions = {}): never => {
	throw new Error("openComposer is not implemented");
};
