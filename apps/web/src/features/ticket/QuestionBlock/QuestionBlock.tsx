import { Link } from "@tanstack/react-router";
import { readQuestionDescription, type Ticket } from "@trellis/api";
import { QuestionBlock as QuestionBlockView, type RecommendedOption, type TicketRef } from "@trellis/ui";
import { useMemo } from "react";
import { useAnswer } from "./useAnswer";

export type QuestionBlockProps = {
	ticket: Ticket;
};

const ticketLink = (identifier: string) => <Link to="/t/$identifier" params={{ identifier }} />;

// This wrapper reads the options and the recommendation out of the ticket
// description, gives each released ticket a router link, and holds the one
// write that answers the question.
export function QuestionBlock({ ticket }: QuestionBlockProps) {
	const question = useMemo(() => readQuestionDescription(ticket.description), [ticket.description]);
	// No record says who wrote the recommendation, so the block names nobody
	// and prints `Recommended.` instead. A person decides here, and a guessed
	// name would be a false fact at that moment.
	const recommendation = useMemo<RecommendedOption | null>(
		() => (question.recommendation === null ? null : { ...question.recommendation, by: null }),
		[question.recommendation],
	);
	const releases = useMemo<TicketRef[]>(
		() => ticket.releases.map((release) => ({ ...release, link: ticketLink(release.identifier) })),
		[ticket.releases],
	);
	const answer = useAnswer(ticket);
	return (
		<QuestionBlockView options={question.options} recommendation={recommendation} releases={releases} {...answer} />
	);
}
