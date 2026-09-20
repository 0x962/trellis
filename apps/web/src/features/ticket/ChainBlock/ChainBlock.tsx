import { Link } from "@tanstack/react-router";
import type { Ticket, TicketSummary } from "@trellis/api";
import {
	type AnsweredQuestion,
	ChainBlock as ChainBlockView,
	type ChainDependency,
	type ChainRelease,
} from "@trellis/ui";
import { useMemo } from "react";
import { readyLine } from "./readyLine";

export type ChainBlockProps = {
	// The tickets that hold this ticket back. The server leaves out a ticket
	// that is done.
	waitsOn: TicketSummary["waitsOn"];
	// The tickets that this ticket holds back.
	releases: TicketSummary["releases"];
	// The questions this ticket waited for, after a person answered them.
	answeredQuestions: Ticket["answeredQuestions"];
};

const ticketLink = (identifier: string) => <Link to="/t/$identifier" params={{ identifier }} />;

// This wrapper gives each chain line a router link and derives the `Ready`
// sentence from `waitsOn`.
export function ChainBlock({ waitsOn, releases, answeredQuestions }: ChainBlockProps) {
	const ready = useMemo(() => readyLine(waitsOn), [waitsOn]);
	const dependencies = useMemo<ChainDependency[]>(
		() => waitsOn.map((dependency) => ({ ...dependency, link: ticketLink(dependency.identifier) })),
		[waitsOn],
	);
	const released = useMemo<ChainRelease[]>(
		() => releases.map((release) => ({ ...release, link: ticketLink(release.identifier) })),
		[releases],
	);
	const answered = useMemo<AnsweredQuestion[]>(
		() => answeredQuestions.map((question) => ({ ...question, link: ticketLink(question.identifier) })),
		[answeredQuestions],
	);
	return <ChainBlockView waitsOn={dependencies} releases={released} ready={ready} answeredQuestions={answered} />;
}
