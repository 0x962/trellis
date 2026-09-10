import type { Priority } from "@trellis/api";
import { create } from "zustand";

// The values the quick composer opens with. The palette fills them from
// the route and from the ticket in context.
export type ComposerDefaults = {
	// A project ref, `CDE.web`.
	project?: string;
	// A status ref, `in-progress`.
	status?: string;
	priority?: Priority;
	// A ticket identifier, `CDE-42`.
	parent?: string;
};

export type ComposerState = {
	open: boolean;
	defaults: ComposerDefaults;
};

export const useComposerStore = create<ComposerState>()(() => ({ open: false, defaults: {} }));

export const composerActions = {
	open: (defaults: ComposerDefaults) => useComposerStore.setState({ open: true, defaults }),
	close: () => useComposerStore.setState({ open: false, defaults: {} }),
};
