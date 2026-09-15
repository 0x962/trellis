import { ulid } from "ulid";
import type { ServiceTransport } from "../../../../server/src/db/transport.ts";
import { actors, minute } from "./support.ts";

// The six tickets an agent finished today, counted from local midnight. A
// fixed age would fall on yesterday for a run in the first minutes of a day. These moves are
// written after the snapshot is restored, against the clock of the run.
//
// They always land inside today, and always inside the last six minutes, so
// they are the six most recent changes of the seed whatever the hour is: the
// oldest fixed change of the seed is nine minutes old.

const DONE_TODAY = [
	{ ticket: "TRL-8", actor: "claude" },
	{ ticket: "CDE-34", actor: "codex" },
	{ ticket: "CDE-33", actor: "codex" },
	{ ticket: "CDE-48", actor: "claude" },
	{ ticket: "CDE-49", actor: "claude" },
	{ ticket: "TRL-7", actor: "claude" },
] as const;

export const seedDoneToday = async (transport: ServiceTransport, now = Date.now()) => {
	const midnight = new Date(now);
	midnight.setHours(0, 0, 0, 0);
	const sinceMidnight = now - midnight.getTime();
	const step = Math.max(1, Math.min(minute, Math.floor(sinceMidnight / (2 * DONE_TODAY.length))));
	for (const [index, entry] of DONE_TODAY.entries()) {
		const at = new Date(now - (DONE_TODAY.length - index) * step);
		await transport.call(
			"tickets.move",
			{ actor: actors[entry.actor], session: null, reqId: ulid(), now: at },
			{ ticket: entry.ticket, status: "done", force: true },
		);
	}
};
