import type { ReactElement } from "react";

// The amber line over restored rows. It renders while the inbox query holds
// cached data and no request has succeeded since the query client was made.
export function OfflineBanner(): ReactElement | null {
	throw new Error("mobile-inbox: OfflineBanner is not implemented");
}
