export const pullRequestFileFields =
	"nodes { path changeType additions deletions } pageInfo { hasNextPage endCursor } totalCount";

export const pullRequestCheckFields = `nodes {
		__typename
		... on CheckRun { name status conclusion startedAt completedAt detailsUrl checkSuite { workflowRun { event workflow { name } } } }
		... on StatusContext { context state targetUrl createdAt }
	} pageInfo { hasNextPage endCursor } totalCount`;
