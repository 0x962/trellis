import type { Priority, Ticket } from "@trellis/api";
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
	// Apply project, epic, and wave once while the composer retains its draft text.
	applyPlacement?: boolean;
	allowLoose?: boolean;
	// Report the first created ticket from this composer opening.
	onCreated?: (ticket: Ticket) => void;
};

export type ComposerState = {
	open: boolean;
	openingId: number;
	options: ComposerOptions;
	assignAgent: boolean;
	createMore: boolean;
};

// Whether the composer is open, and what opened it. The dialog mounts from
// the root shell, so any page opens it.
export const useComposerStore = create<ComposerState>()(
	persist((): ComposerState => ({ open: false, openingId: 0, options: {}, assignAgent: true, createMore: false }), {
		name: "trellis-composer-preferences",
		partialize: ({ assignAgent, createMore }) => ({ assignAgent, createMore }),
	}),
);

export const composerActions = {
	open: (options: ComposerOptions = {}) =>
		useComposerStore.setState((state) => ({ open: true, openingId: state.openingId + 1, options })),
	close: () => useComposerStore.setState({ open: false, options: {} }),
	created: (openingId: number, ticket: Ticket) => {
		const state = useComposerStore.getState();
		if (!state.open || state.openingId !== openingId) return;
		const onCreated = state.options.onCreated;
		composerActions.clearOnCreated();
		onCreated?.(ticket);
	},
	clearOnCreated: () => {
		const { options } = useComposerStore.getState();
		if (options.onCreated) useComposerStore.setState({ options: { ...options, onCreated: undefined } });
	},
	setAssignAgent: (assignAgent: boolean) => useComposerStore.setState({ assignAgent }),
	setCreateMore: (createMore: boolean) => useComposerStore.setState({ createMore }),
};
