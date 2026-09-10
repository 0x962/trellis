import type { GhStatus } from "@trellis/api";
import type { Bus } from "./events/bus.ts";
import type { GhRunner } from "./gh/run.ts";
import { checkGh } from "./services/system.ts";

export type GhStateOptions = { bus: Bus; gh: GhRunner; now: () => Date };

// The gh state that the health route reports. `check()` sets it from
// `gh auth status`, and the boot calls it once. After that, each gh.status
// event on the bus sets it. The poller sends that event when gh signs out or
// signs back in, so health follows gh with no restart.
//
// A sign-in event carries no user name, so it runs the check again to read
// one. The poller also sends { ok: true } when the rate limit budget
// changes. That event changes nothing while gh is ready.
export const createGhState = ({ bus, gh, now }: GhStateOptions) => {
	let status: GhStatus = { ok: false, user: null, reason: "error", message: "Not checked yet.", checkedAt: null };

	const check = async () => {
		status = await checkGh(gh, now());
		return status;
	};

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

	return { current: () => status, check };
};
