import { statusText, type Ticket, type TicketPr } from "@trellis/api";

type NamedTicket = Ticket["releases"][number];
type WaitsOnTicket = Ticket["waitsOn"][number];
type DerivedPr = Pick<TicketPr, "number" | "baseRef"> & {
	stackedOn: NonNullable<TicketPr["stackedOn"]>;
};

export type DepsResult = {
	ticket: NamedTicket;
	waitsOn: WaitsOnTicket[];
	releases: NamedTicket[];
	derived: DerivedPr[];
};

const releaseLines = (tickets: NamedTicket[]): string[] => {
	if (tickets.length === 0) return ["    nothing"];
	const identifierWidth = Math.max(...tickets.map((ticket) => ticket.identifier.length));
	return tickets.map((ticket) => `    ${ticket.identifier.padEnd(identifierWidth)}  ${ticket.title}`);
};

const waitsOnLines = (tickets: WaitsOnTicket[]): string[] => {
	if (tickets.length === 0) return ["    nothing"];
	const identifierWidth = Math.max(...tickets.map((ticket) => ticket.identifier.length));
	const titleWidth = Math.max(...tickets.map((ticket) => ticket.title.length));
	return tickets.map(
		(ticket) =>
			`    ${ticket.identifier.padEnd(identifierWidth)}  ${ticket.title.padEnd(titleWidth)}  ${statusText(ticket)}`,
	);
};

const derivedLines = (prs: DerivedPr[]): string[] =>
	prs.length === 0
		? ["    nothing"]
		: prs.map(
				(pr) =>
					`    #${pr.number} is based on ${pr.baseRef}, the head of #${pr.stackedOn.number} (${pr.stackedOn.ticketIdentifier})`,
			);

export const depsText = (result: DepsResult): string =>
	`${[
		`${result.ticket.identifier}  ${result.ticket.title}`,
		"  waits on",
		...waitsOnLines(result.waitsOn),
		"  releases",
		...releaseLines(result.releases),
		"  derived",
		...derivedLines(result.derived),
	].join("\n")}\n`;
