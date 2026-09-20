import { Link } from "@tanstack/react-router";
import type { TicketSummary } from "@trellis/api";
import { ChainBlock as ChainBlockView, type ChainDependency, type ChainRelease } from "@trellis/ui";
import { useMemo } from "react";
import { readyLine } from "./readyLine";

export type ChainBlockProps = {
	// The tickets that hold this ticket back. The server leaves out a ticket
	// that is done.
	waitsOn: TicketSummary["waitsOn"];
	// The tickets that this ticket holds back.
	releases: TicketSummary["releases"];
};

// A click on a chain line opens the ticket the line names.
const ticketLink = (identifier: string) => <Link to="/t/$identifier" params={{ identifier }} />;

// The chain of a ticket: what holds it back, whether it can start, what it
// holds back, and the open question it applies. `Ready` is the one derived
// sentence.
export function ChainBlock({ waitsOn, releases }: ChainBlockProps) {
	const ready = useMemo(() => readyLine(waitsOn), [waitsOn]);
	const dependencies = useMemo<ChainDependency[]>(
		() => waitsOn.map((dependency) => ({ ...dependency, link: ticketLink(dependency.identifier) })),
		[waitsOn],
	);
	const released = useMemo<ChainRelease[]>(
		() => releases.map((release) => ({ ...release, link: ticketLink(release.identifier) })),
		[releases],
	);
	return <ChainBlockView waitsOn={dependencies} releases={released} ready={ready} />;
}
