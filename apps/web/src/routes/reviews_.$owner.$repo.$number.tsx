import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ProjectRefStringSchema, reviewRef, TicketRefStringSchema } from "@trellis/api";
import { ReviewPage } from "../features/reviews/ReviewPage/ReviewPage";
import { type ReviewTab, reviewTabOf } from "../features/reviews/ReviewPage/reviewTab";
import { projectSlashPath } from "../lib/projectPath";

// `project` names the project whose Diffs page opened the review, so the
// title links back to it. A review opened by its URL alone carries none.
// `tab` names the tab the person picked, so a link opens that tab.
type ReviewSearch = { project?: string; ticket?: string; tab?: ReviewTab };

export const Route = createFileRoute("/reviews_/$owner/$repo/$number")({
	validateSearch: (search: Record<string, unknown>): ReviewSearch => {
		const project = ProjectRefStringSchema.safeParse(search.project);
		const ticket = TicketRefStringSchema.safeParse(search.ticket);
		const tab = reviewTabOf(search.tab);
		return {
			...(project.success ? { project: project.data } : {}),
			...(ticket.success ? { ticket: ticket.data } : {}),
			...(tab === undefined ? {} : { tab }),
		};
	},
	component: Page,
});

function Page() {
	const { owner, repo, number } = Route.useParams();
	const { project, ticket, tab } = Route.useSearch();
	const navigate = useNavigate();
	const pr = reviewRef(`${owner}/${repo}#${number}`).url;
	const parent =
		ticket !== undefined ? (
			<Link to="/t/$identifier" params={{ identifier: ticket }}>
				{ticket}
			</Link>
		) : project === undefined ? undefined : (
			<Link to="/p/$" params={{ _splat: `${projectSlashPath(project)}/diffs` }} search={{}}>
				Diffs
			</Link>
		);
	// The hash holds the review comment that a deep link opens, so a tab
	// change keeps it.
	return (
		<ReviewPage
			key={pr}
			pr={pr}
			parent={parent}
			tab={tab}
			onTabChange={(next) =>
				void navigate({ to: ".", search: (current) => ({ ...current, tab: next }), hash: true, replace: true })
			}
		/>
	);
}
