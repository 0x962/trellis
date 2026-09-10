import { formatCount } from "../../../../lib/format";

// The one line Needs you shows when every section is empty. `started` is
// the number of tickets an agent has in progress.
export const emptyLine = (started: number): string => {
	if (started === 0) return "Nothing needs you.";
	const noun = started === 1 ? "ticket" : "tickets";
	return `Nothing needs you. ${formatCount(started)} ${noun} in progress by agents.`;
};
