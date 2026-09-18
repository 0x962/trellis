import { createFileRoute, Link } from "@tanstack/react-router";
import { ProjectRefStringSchema, reviewRef } from "@trellis/api";
import { ReviewPage } from "../features/reviews/ReviewPage/ReviewPage";
import { projectSlashPath } from "../lib/projectPath";

// `project` names the project whose Diffs page opened the review, so the
// title links back to it. A review opened by its URL alone carries none.
type ReviewSearch = { project?: string };

export const Route = createFileRoute("/reviews_/$owner/$repo/$number")({
	validateSearch: (search: Record<string, unknown>): ReviewSearch => {
		const project = ProjectRefStringSchema.safeParse(search.project);
		return project.success ? { project: project.data } : {};
	},
	component: Page,
});

function Page() {
	const { owner, repo, number } = Route.useParams();
	const { project } = Route.useSearch();
	const pr = reviewRef(`${owner}/${repo}#${number}`).url;
	const parent =
		project === undefined ? undefined : (
			<Link to="/p/$" params={{ _splat: `${projectSlashPath(project)}/diffs` }} search={{}}>
				Diffs
			</Link>
		);
	return <ReviewPage key={pr} pr={pr} parent={parent} />;
}
