import type { Priority } from "@trellis/api";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// What the caller that opens the quick composer already knows. The palette
// fills it from the route and from the ticket in context; a table group
// header fills the status, and on a table of one epic the epic and the
// wave of the group. The dialog resolves the rest with
// `useComposerDefaults`.
export type ComposerOptions = {
	// A project ref, `CDE.web`.
	project?: string;
	// A status ref, `in-progress`.
	status?: string;
	priority?: Priority;
	// A ticket identifier, `CDE-42`.
	parent?: string;
	// An epic ref, `OP/routine-runtime`.
	epic?: string;
	// A wave ref of `epic`, `OP/routine-runtime/phase-1`.
	wave?: string;
};

export type ComposerState = {
	open: boolean;
	options: ComposerOptions;
	assignAgent: boolean;
	createMore: boolean;
};

// Whether the composer is open, and what opened it. The dialog mounts from
// the root shell, so any page opens it.
export const useComposerStore = create<ComposerState>()(
	persist((): ComposerState => ({ open: false, options: {}, assignAgent: true, createMore: false }), {
		name: "trellis-composer-preferences",
		partialize: ({ assignAgent, createMore }) => ({ assignAgent, createMore }),
	}),
);

export const composerActions = {
	open: (options: ComposerOptions = {}) => useComposerStore.setState({ open: true, options }),
	close: () => useComposerStore.setState({ open: false, options: {} }),
	setAssignAgent: (assignAgent: boolean) => useComposerStore.setState({ assignAgent }),
	setCreateMore: (createMore: boolean) => useComposerStore.setState({ createMore }),
};
