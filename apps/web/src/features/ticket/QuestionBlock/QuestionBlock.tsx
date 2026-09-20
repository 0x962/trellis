import { Link } from "@tanstack/react-router";
import { questionParts, type Ticket } from "@trellis/api";
import { QuestionBlock as QuestionBlockView, type QuestionRecommendation, type TicketRef } from "@trellis/ui";
import { useMemo } from "react";
import { useAnswer } from "./useAnswer";

export type QuestionBlockProps = {
	ticket: Ticket;
};

const ticketLink = (identifier: string) => <Link to="/t/$identifier" params={{ identifier }} />;

// The name that wrote the recommendation. The description names no author,
// so the block credits whoever touched the ticket last, and only when that
// was an agent.
const recommendedBy = (lastActor: Ticket["lastActor"]) =>
	lastActor === null || lastActor.kind !== "agent" ? null : lastActor.name;

// This wrapper reads the options and the recommendation out of the ticket
// description, gives each released ticket a router link, and holds the one
// write that answers the question.
export function QuestionBlock({ ticket }: QuestionBlockProps) {
	const parts = useMemo(() => questionParts(ticket.description), [ticket.description]);
	const recommendation = useMemo<QuestionRecommendation | null>(
		() => (parts.recommendation === null ? null : { ...parts.recommendation, by: recommendedBy(ticket.lastActor) }),
		[parts.recommendation, ticket.lastActor],
	);
	const releases = useMemo<TicketRef[]>(
		() => ticket.releases.map((release) => ({ ...release, link: ticketLink(release.identifier) })),
		[ticket.releases],
	);
	const answer = useAnswer(ticket);
	return <QuestionBlockView choices={parts.options} recommendation={recommendation} releases={releases} {...answer} />;
}
