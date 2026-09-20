import type { StatusCategory } from "@trellis/api";

export type DependencyTicket = {
	identifier: string;
	title: string;
};

export type WaitsOnTicket = DependencyTicket & {
	status: StatusCategory;
	isQuestion: boolean;
};

export type DerivedDependency = {
	number: number;
	baseRef: string;
	stackedOn: {
		number: number;
		headRef: string;
		ticketIdentifier: string;
	};
};

export type DepsResult = {
	ticket: DependencyTicket;
	waitsOn: WaitsOnTicket[];
	releases: DependencyTicket[];
	derived: DerivedDependency[];
};

const statusText = (ticket: WaitsOnTicket): string => {
	if (ticket.status === "started") return "in progress";
	if (ticket.status === "review") return ticket.isQuestion ? "human review" : "agent review";
	return ticket.status;
};

const ticketLines = (tickets: DependencyTicket[]): string[] => {
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

const derivedLines = (dependencies: DerivedDependency[]): string[] =>
	dependencies.length === 0
		? ["    nothing"]
		: dependencies.map(
				(dependency) =>
					`    #${dependency.number} is based on ${dependency.baseRef}, the head of #${dependency.stackedOn.number} (${dependency.stackedOn.ticketIdentifier})`,
			);

export const depsText = (result: DepsResult): string =>
	`${[
		`${result.ticket.identifier}  ${result.ticket.title}`,
		"  waits on",
		...waitsOnLines(result.waitsOn),
		"  releases",
		...ticketLines(result.releases),
		"  derived",
		...derivedLines(result.derived),
	].join("\n")}\n`;
