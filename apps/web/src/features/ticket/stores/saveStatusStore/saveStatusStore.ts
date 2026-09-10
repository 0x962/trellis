import { create } from "zustand";

export type SaveState = "idle" | "saving" | "saved";

type SaveStatus = {
	// The identifier of the ticket whose description last saved.
	identifier: string | null;
	state: SaveState;
	set: (identifier: string, state: SaveState) => void;
};

// The description editor reports its save here, and the rail shows "Saved"
// beside the version. The rail shows it only for the ticket that saved.
export const useSaveStatusStore = create<SaveStatus>()((set) => ({
	identifier: null,
	state: "idle",
	set: (identifier, state) => set({ identifier, state }),
}));
