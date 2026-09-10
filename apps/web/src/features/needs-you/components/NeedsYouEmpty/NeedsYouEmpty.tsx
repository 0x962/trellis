import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { Inbox } from "lucide-react";
import { useApp } from "../../../../lib/appContext";
import { startedLine } from "../../utils/emptyLine";
import { StartCard } from "./components/StartCard";
import { useStartCardDismissed } from "./hooks/useStartCardDismissed";

// The Active preset: every ticket in a started status.
const startedInput = { category: ["started" as const] };

// The whole pane when nothing waits on a person. The heading states the
// fact, the line counts the started tickets and links to them, and a home
// with no ticket gets the start card under the block.
export function NeedsYouEmpty() {
	const { orpc } = useApp();
	const started = useQuery(orpc.tickets.counts.queryOptions({ input: startedInput })).data;
	const all = useQuery(orpc.tickets.counts.queryOptions({ input: {} })).data;
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data;
	const [dismissed, dismiss] = useStartCardDismissed();
	if (started === undefined || all === undefined || projects === undefined) return null;

	const home = projects.find((project) => project.parentId === null);
	const showCard = all.total === 0 && home !== undefined && !dismissed;
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
			action={showCard ? <StartCard projectKey={home.key} onDismiss={dismiss} /> : undefined}
		/>
	);
}
