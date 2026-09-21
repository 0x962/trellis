import { createFileRoute, Link } from "@tanstack/react-router";
import { ProjectRefStringSchema, reviewRef, TicketRefStringSchema } from "@trellis/api";
import { ReviewPage } from "../features/reviews/ReviewPage/ReviewPage";
import { projectSlashPath } from "../lib/projectPath";

// `project` names the project whose Diffs page opened the review, so the
// title links back to it. A review opened by its URL alone carries none.
type ReviewSearch = { project?: string; ticket?: string };

export const Route = createFileRoute("/reviews_/$owner/$repo/$number")({
	validateSearch: (search: Record<string, unknown>): ReviewSearch => {
		const project = ProjectRefStringSchema.safeParse(search.project);
		const ticket = TicketRefStringSchema.safeParse(search.ticket);
		return {
			...(project.success ? { project: project.data } : {}),
			...(ticket.success ? { ticket: ticket.data } : {}),
		};
	},
	component: Page,
});

function Page() {
	const { owner, repo, number } = Route.useParams();
	const { project, ticket } = Route.useSearch();
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
	return <ReviewPage key={pr} pr={pr} parent={parent} />;
}
