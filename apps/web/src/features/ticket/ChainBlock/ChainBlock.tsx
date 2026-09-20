import { Link } from "@tanstack/react-router";
import type { Ticket, TicketSummary } from "@trellis/api";
import { type ChainAnswer, ChainBlock as ChainBlockView, type ChainDependency, type ChainRelease } from "@trellis/ui";
import { useMemo } from "react";
import { readyLine } from "./readyLine";

export type ChainBlockProps = {
	// The tickets that hold this ticket back. The server leaves out a ticket
	// that is done.
	waitsOn: TicketSummary["waitsOn"];
	// The tickets that this ticket holds back.
	releases: TicketSummary["releases"];
	// The question this ticket waited for, once a person answered it. It is
	// gone from `waitsOn` by then, because the server leaves out a ticket that
	// is done, so the server reads it again for the ticket page.
	answeredQuestion: Ticket["answeredQuestion"];
};

const ticketLink = (identifier: string) => <Link to="/t/$identifier" params={{ identifier }} />;

// This wrapper gives each chain line a router link and derives the `Ready`
// sentence from `waitsOn`.
export function ChainBlock({ waitsOn, releases, answeredQuestion }: ChainBlockProps) {
	const ready = useMemo(() => readyLine(waitsOn), [waitsOn]);
	const dependencies = useMemo<ChainDependency[]>(
		() => waitsOn.map((dependency) => ({ ...dependency, link: ticketLink(dependency.identifier) })),
		[waitsOn],
	);
	const released = useMemo<ChainRelease[]>(
		() => releases.map((release) => ({ ...release, link: ticketLink(release.identifier) })),
		[releases],
	);
	const answered = useMemo<ChainAnswer | null>(
		() => (answeredQuestion === null ? null : { ...answeredQuestion, link: ticketLink(answeredQuestion.identifier) }),
		[answeredQuestion],
	);
	return <ChainBlockView waitsOn={dependencies} releases={released} ready={ready} answered={answered} />;
}
