import type { LiveStatus } from "../../../lib/live";
import type { FailureKind } from "./failureKind";

// The failure that the page shows. A route file that does not load while
// the connection is down means the server is down, not a new build, so the
// page says the server is offline instead of asking for a reload that
// cannot work.
export const shownFailure = (failure: FailureKind, status: LiveStatus): FailureKind =>
	failure === "chunk" && status !== "live" ? "offline" : failure;

// True at the moment the live connection comes back under an offline
// failure. The route then loads again by itself, so a person who waits for
// the server never presses Retry.
export const failureRecovered = (shown: FailureKind, status: LiveStatus, before: LiveStatus) =>
	shown === "offline" && status === "live" && before !== "live";
