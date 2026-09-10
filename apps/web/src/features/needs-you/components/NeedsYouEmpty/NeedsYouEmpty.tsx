import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApp } from "../../../../lib/appContext";
import { emptyLine } from "../../utils/emptyLine";

// The Active preset: every ticket an agent has in progress.
const startedInput = { category: ["started" as const] };

// The whole screen when nothing waits on a person. The line names what the
// agents hold and links to the list of it. With nothing in progress the
// line names no tickets, so it has no link.
export function NeedsYouEmpty() {
	const { orpc } = useApp();
	const counts = useQuery(orpc.tickets.counts.queryOptions({ input: startedInput }));
	if (counts.data === undefined) return null;

	return (
		<div className="flex h-full items-center justify-center">
			<p className="text-fg-muted">
				{emptyLine(counts.data.total)}
				{counts.data.total > 0 && (
					<>
						{" "}
						<Link
							to="/all"
							search={{ category: ["started"] }}
							className="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
						>
							Show them
						</Link>
					</>
				)}
			</p>
		</div>
	);
}
