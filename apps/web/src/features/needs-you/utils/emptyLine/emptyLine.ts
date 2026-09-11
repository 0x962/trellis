import { formatCount } from "../../../../lib/format";

// The count of the tickets in a started status, human or agent, as a
// sentence with a matching verb. It sits under the "Nothing needs you"
// heading of the empty page.
export const startedLine = (started: number): string => {
	if (started === 0) return "No ticket is in progress.";
	return `${formatCount(started)} ${started === 1 ? "ticket is" : "tickets are"} in progress.`;
};
