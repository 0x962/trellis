import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { EmptyState, SectionHeader } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../../../../lib/appContext";
import { CommentThread } from "../CommentThread";

export function MentionedThread({ id, ticket }: { id: string; ticket: Ticket }) {
	const { orpc, queryClient } = useApp();
	const query = useQuery(orpc.comments.thread.queryOptions({ input: { id } }));
	const element = useRef<HTMLElement>(null);
	const ready = query.data !== undefined;
	useEffect(() => {
		if (ready) element.current?.scrollIntoView({ block: "center" });
	}, [ready]);
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.comments.thread.key({ input: { id } }) });
	};
	return (
		<section ref={element} aria-label="Mentioned comment" className="mb-4 rounded-lg border border-border p-3">
			<SectionHeader title="Mentioned comment" />
			{query.isPending && (
				<p role="status" className="py-3 text-sm text-fg-muted">
					Load comment…
				</p>
			)}
			{query.error && <EmptyState title="The comment did not load." description={query.error.message} />}
			{query.data && query.data.root.ticketId !== ticket.id && (
				<EmptyState title="This comment belongs to another ticket." />
			)}
			{query.data && query.data.root.ticketId === ticket.id && (
				<ul>
					<CommentThread
						id={query.data.root.id}
						identifier={ticket.identifier}
						comments={[query.data.root, ...query.data.replies]}
						onEdited={refresh}
						onDeleted={refresh}
						onCreated={refresh}
					/>
				</ul>
			)}
		</section>
	);
}
