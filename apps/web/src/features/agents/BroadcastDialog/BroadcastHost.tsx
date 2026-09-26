import { BroadcastDialog } from "./BroadcastDialog";
import { broadcastActions, useBroadcastStore } from "./broadcastStore";

export function BroadcastHost() {
	const open = useBroadcastStore((state) => state.open);
	return open ? <BroadcastDialog onClose={broadcastActions.close} /> : null;
}
