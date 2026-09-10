import { create } from "zustand";

type ShortcutsState = {
	open: boolean;
	setOpen: (open: boolean) => void;
};

// Whether the shortcut help is open. The `?` key, the sidebar help button,
// and the dialog itself all read and write this one value.
export const useShortcutsStore = create<ShortcutsState>()((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
}));

export const openShortcuts = () => useShortcutsStore.setState({ open: true });
