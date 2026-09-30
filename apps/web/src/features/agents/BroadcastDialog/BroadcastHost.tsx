import { BroadcastDialog } from "./BroadcastDialog";
import { broadcastActions, useBroadcastStore } from "./broadcastStore";

export function BroadcastHost() {
	const open = useBroadcastStore((state) => state.open);
	const epic = useBroadcastStore((state) => state.epic);
	return open ? <BroadcastDialog key={epic?.ref ?? "global"} epic={epic} onClose={broadcastActions.close} /> : null;
}
