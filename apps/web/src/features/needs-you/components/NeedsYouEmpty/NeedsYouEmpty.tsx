import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { Inbox } from "lucide-react";
import { useApp } from "../../../../lib/appContext";
import { startedLine } from "../../utils/emptyLine";

// The Active preset: every ticket in a started status.
const startedInput = { category: ["started" as const] };

// The whole pane when nothing waits on a person. The heading states the
// fact, and the line counts the tickets in progress and links to them.
export function NeedsYouEmpty() {
	const { orpc } = useApp();
	const started = useQuery(orpc.tickets.counts.queryOptions({ input: startedInput })).data;
	if (started === undefined) return null;

	return (
		<EmptyState
			variant="page"
			className="h-full"
			icon={<Inbox />}
			title="Nothing needs you"
			description={
				<>
					{startedLine(started.total)}
					{started.total > 0 && (
						<>
							{" "}
							<Link
								to="/all"
								search={{ category: ["started"] }}
								className="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
							>
								Show started tickets
							</Link>
						</>
					)}
				</>
			}
		/>
	);
}
