import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type WidthPreference = { width: number | null; onWidthChange: (width: number) => void };

const storage = {
	getItem: (name: string) => {
		try {
			return globalThis.localStorage?.getItem(name) ?? null;
		} catch {
			return null;
		}
	},
	setItem: (name: string, value: string) => {
		try {
			globalThis.localStorage?.setItem(name, value);
		} catch {
			return;
		}
	},
	removeItem: (name: string) => {
		try {
			globalThis.localStorage?.removeItem(name);
		} catch {
			return;
		}
	},
};

export const useStatusPaneWidth = create<WidthPreference>()(
	persist(
		(set) => ({ width: null, onWidthChange: (width) => set({ width }) }),
		{
			name: "trellis-session-updates-width",
			storage: createJSONStorage(() => storage),
			partialize: ({ width }) => ({ width }),
			merge: (saved, current) => {
				const width = typeof saved === "object" && saved !== null && "width" in saved ? saved.width : null;
				return { ...current, width: typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null };
			},
		},
	),
);
