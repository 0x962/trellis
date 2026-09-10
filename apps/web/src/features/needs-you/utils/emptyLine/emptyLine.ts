import { formatCount } from "../../../../lib/format";

// The count of the tickets in a started status, human or agent, as a
// sentence with a matching verb.
export const startedLine = (started: number): string => {
	if (started === 0) return "No ticket is in progress.";
	return `${formatCount(started)} ${started === 1 ? "ticket is" : "tickets are"} in progress.`;
};

// The one sentence that says Needs you is empty. `started` is the number of
// tickets in a started status. A zero count drops the second sentence.
export const emptyLine = (started: number): string =>
	started === 0 ? "Nothing needs you." : `Nothing needs you. ${startedLine(started)}`;
