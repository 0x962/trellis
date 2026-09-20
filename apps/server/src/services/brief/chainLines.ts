import { blockReason, statusText, type Ticket } from "@trellis/api";
import type { ChainRow } from "../../db/queries/chainRows.ts";

type ChainTicket = Pick<Ticket, "ready" | "releases">;

const joinWithAnd = (parts: string[]) => {
	if (parts.length === 1) return parts[0] as string;
	return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
};

const releaseLines = (releases: Ticket["releases"]) =>
	releases.length === 0 ? ["  - nothing"] : releases.map((release) => `  - ${release.identifier} ${release.title}`);

const waitsOnLines = (waitsOn: ChainRow[]) => {
	if (waitsOn.length === 0) return ["  - nothing"];
	return waitsOn.flatMap((blocker) => [
		`  - ${blocker.identifier} ${blocker.title} (${statusText(blocker)})`,
		...(blocker.status === "done" && blocker.outcome !== "" ? [`    Outcome: ${blocker.outcome}`] : []),
	]);
};

const readyLine = (ready: boolean, blockers: ChainRow[]) => {
	if (ready) return "yes. No ticket holds this one back.";
	if (blockers.length === 0) return "no.";
	return `no. ${joinWithAnd(blockers.map((blocker) => `${blocker.identifier} ${blockReason(blocker)}`))}.`;
};

export const chainLines = (ticket: ChainTicket, waitsOn: ChainRow[]): string[] => {
	const blockers = waitsOn.filter((blocker) => blocker.status !== "done" && blocker.status !== "canceled");
	const question = blockers.find((blocker) => blocker.isQuestion);
	return [
		"## Chain",
		"",
		"- Waits on:",
		...waitsOnLines(waitsOn),
		`- Ready: ${readyLine(ticket.ready, blockers)}`,
		"- Releases:",
		...releaseLines(ticket.releases),
		...(question === undefined ? [] : [`- Applies: ${question.identifier}, open. ${question.title}`]),
	];
};
