import type { GhStatus } from "@trellis/api";
import type { Bus } from "./events/bus.ts";
import type { GhRunner } from "./gh/run.ts";
import { checkGh } from "./services/system.ts";

export type GhStateOptions = { bus: Bus; gh: GhRunner; now: () => Date };

// How the `system.gh` and `system.checkGh` procedures reach the gh state.
// Both run in the HTTP process, so a slow `gh auth status` never holds the
// database worker.
export type GhAccess = { read: () => Promise<GhStatus>; check: () => Promise<GhStatus> };

// The gh state that the health route and `system.gh` report. `check()` sets
// it from `gh auth status`, and the boot calls it once. After that, each
// gh.status event on the bus sets it. The poller sends that event when gh
// signs out or signs back in, so the state follows gh with no restart.
//
// A sign-in event carries no user name, so it runs the check again to read
// one. The poller also sends { ok: true } when the rate limit budget
// changes. That event changes nothing while gh is ready.
//
// `read()` waits for a check that is still running, so a page that loads
// during the boot check gets the real answer and not the placeholder. Two
// checks at the same time share one `gh auth status`.
export const createGhState = ({ bus, gh, now }: GhStateOptions) => {
	let status: GhStatus = {
		ok: false,
		user: null,
		reason: "error",
		message: "The server checks gh at startup. The check did not finish.",
		checkedAt: null,
	};
	let running: Promise<GhStatus> | null = null;

	const check = () => {
		running ??= checkGh(gh, now()).then((next) => {
			status = next;
			running = null;
			return next;
		});
		return running;
	};

	const read = () => running ?? Promise.resolve(status);

	bus.subscribe(
		({ event }) => {
			if (event.type !== "gh.status") return;
			if (!event.ok) {
				status = { ok: false, user: null, reason: event.reason!, message: null, checkedAt: now().toISOString() };
				return;
			}
			if (!status.ok) void check();
		},
		{ types: ["gh.status"] },
	);

	return { current: () => status, check, read };
};
