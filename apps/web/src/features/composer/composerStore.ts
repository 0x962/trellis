import { create } from "zustand";

export type ComposerOptions = {
	// A status ref the composer starts with, from a group header.
	status?: string;
	// A parent ticket ref, from a ticket page.
	parent?: string;
	// A project ref, when the page is not a project route.
	project?: string;
};

type ComposerState = {
	open: boolean;
	options: ComposerOptions;
};

// Whether the composer is open, and what opened it. The dialog mounts from
// the root shell, so any page opens it.
export const useComposerStore = create<ComposerState>()(() => ({ open: false, options: {} }));

export const openComposer = (options: ComposerOptions = {}) => useComposerStore.setState({ open: true, options });

export const closeComposer = () => useComposerStore.setState({ open: false, options: {} });
