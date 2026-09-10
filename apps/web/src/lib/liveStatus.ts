import { useSyncExternalStore } from "react";
import type { Live, LiveStatus } from "./live";

// The connection status, re-read on every change.
export const useLiveStatus = (live: Live): LiveStatus => useSyncExternalStore(live.status.subscribe, live.status.get);
