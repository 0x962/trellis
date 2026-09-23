import { useQuery } from "@tanstack/react-query";
import type { Label, LabelGroup } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";

const none: { labels: Label[]; groups: LabelGroup[] } = { labels: [], groups: [] };

// The labels and label groups a ticket of this project can take. The root
// project owns them.
// Both lists are empty until the query lands. The composer has no project
// until a person picks one, and a call with no path asks the server nothing.
export const useLabels = (projectKey: string | undefined) => {
	const { orpc } = useApp();
	const query = useQuery(
		orpc.labels.list.queryOptions({ input: { project: projectKey ?? "" }, enabled: projectKey !== undefined }),
	);
	return query.data ?? none;
};
