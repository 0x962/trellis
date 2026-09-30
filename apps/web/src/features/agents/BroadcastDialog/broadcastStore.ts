import type { EpicLink } from "@trellis/api";
import { create } from "zustand";

export type BroadcastEpic = Pick<EpicLink, "ref" | "name">;
type BroadcastState = { open: boolean; epic: BroadcastEpic | null };

export const useBroadcastStore = create<BroadcastState>()(() => ({ open: false, epic: null }));

export const broadcastActions = {
	open: (epic: BroadcastEpic | null = null) => useBroadcastStore.setState({ open: true, epic }),
	close: () => useBroadcastStore.setState({ open: false, epic: null }),
};
