import { useQuery } from "@tanstack/react-query";
import type { Label, LabelGroup } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";

export type ScopeLabels = {
	labels: readonly Label[];
	groups: readonly LabelGroup[];
};

const none: ScopeLabels = { labels: [], groups: [] };

// The labels and the label groups a route can filter by. The root project of
// a tree owns them, so any project path of that tree returns the same lists.
// A route without a project, such as the search page, has no one tree to read,
// so it sends no request and both lists stay empty.
export const useScopeLabels = (project: string | undefined): ScopeLabels => {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.labels.list.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	return query.data ?? none;
};
