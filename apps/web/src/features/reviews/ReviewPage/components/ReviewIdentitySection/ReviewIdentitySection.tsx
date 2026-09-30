import { TicketId } from "@trellis/ui";
import type { ComponentProps } from "react";
import { TicketLink } from "../../../../shell/TicketLink";
import { ReviewIdentity } from "../ReviewIdentity";

export function ReviewIdentitySection({
	ticket,
	...identity
}: ComponentProps<typeof ReviewIdentity> & {
	ticket: { identifier: string; title: string } | null;
}) {
	return (
		<div className="review-identity">
			<ReviewIdentity {...identity} />
			<div className="review-identity-lines">
				{ticket && (
					<p className="review-ticket-line">
						<TicketLink identifier={ticket.identifier}>
							<TicketId id={ticket.identifier} />
						</TicketLink>{" "}
						{ticket.title}
					</p>
				)}
			</div>
		</div>
	);
}
