import { create } from "zustand";

type BroadcastState = { open: boolean };

export const useBroadcastStore = create<BroadcastState>()(() => ({ open: false }));

export const broadcastActions = {
	open: () => useBroadcastStore.setState({ open: true }),
	close: () => useBroadcastStore.setState({ open: false }),
};
