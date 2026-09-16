import { create } from "zustand";

// Whether the New session dialog is open. The dialog mounts from the root
// shell, so the sidebar, the phone sheet, and any page open it without a
// second modal layer under it.
export const useSessionComposerStore = create<{ open: boolean }>()(() => ({ open: false }));

export const sessionComposerActions = {
	open: () => useSessionComposerStore.setState({ open: true }),
	close: () => useSessionComposerStore.setState({ open: false }),
};
