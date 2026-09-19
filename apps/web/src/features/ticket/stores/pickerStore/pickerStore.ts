import { create } from "zustand";

export type PickerKind = "status" | "priority" | "parent" | "project" | "epic" | "milestone" | "labels";

type PickerState = {
	open: PickerKind | null;
	setOpen: (open: PickerKind | null) => void;
};

// Which property picker is open on the ticket surface. The rail draws the
// pickers; the s, p, Shift+P, m, and l keys and the more menu open them
// through this one value, so a caller needs no handle on the rail.
export const usePickerStore = create<PickerState>()((set) => ({
	open: null,
	setOpen: (open) => set({ open }),
}));

export const openPicker = (kind: PickerKind) => usePickerStore.setState({ open: kind });
