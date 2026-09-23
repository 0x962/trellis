import { create } from "zustand";

export type PickerKind = "status" | "priority" | "parent" | "dependencies" | "blocks" | "epic" | "wave" | "labels";

type PickerState = {
	open: PickerKind | null;
	setOpen: (open: PickerKind | null) => void;
};

// The property picker that is open on the ticket surface. The rail draws
// each picker. Keyboard shortcuts and the menu set this one value.
export const usePickerStore = create<PickerState>()((set) => ({
	open: null,
	setOpen: (open) => set({ open }),
}));

export const openPicker = (kind: PickerKind) => usePickerStore.setState({ open: kind });
