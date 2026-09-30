import { expect, test } from "bun:test";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReviewSubmission } from "@trellis/api";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "test-renderer";
import { createQueryClient } from "../../../../../lib/orpc";
import { ReviewIdentity } from "../../components/ReviewIdentity";
import { ReviewNotices } from "../../components/ReviewNotices";
import { useLocalReviewVerdict } from "./useLocalReviewVerdict";

test("a failed first read stays unavailable until a retry returns the human approval", async () => {
	const queryClient = createQueryClient();
	let calls = 0;
	const approval: ReviewSubmission = {
		id: "01S",
		prId: "01P",
		url: "https://github.com/acme/app/pull/1",
		author: "navid",
		verdict: "approved",
		body: "",
		revisionId: null,
		headSha: null,
		byPerson: true,
		threads: [],
		createdAt: "2026-09-29T20:00:00.000Z",
		deliveries: [],
	};
	const options = {
		queryKey: ["failed-local-review"],
		queryFn: async () => {
			if (calls++ === 0) throw new Error("Submission read failed");
			return [approval];
		},
	};
	let markup = () => "";
	let retry = async () => {};
	function Probe() {
		const query = useQuery({ ...options, enabled: false });
		const verdict = useLocalReviewVerdict(query.data);
		retry = async () => { await query.refetch(); };
		markup = () => renderToStaticMarkup(
			<>
				<ReviewIdentity
					pr={approval.url}
					revision={null}
					pullRequest={{ state: "OPEN" }}
					isQueued={false}
					linkedPr={null}
					localState="ready"
					locallyApproved={verdict === undefined ? null : verdict === "approved"}
					onAction={() => void retry()}
				/>
				<ReviewNotices
					pr={approval.url}
					hasRevision={false}
					metadata={undefined}
					metadataError={null}
					statusError={null}
					refreshError={null}
					threadsError={null}
					submissionsError={query.isError ? query.error.message : null}
					retrySubmissions={() => void retry()}
				/>
			</>,
		);
		return null;
	}
	const root = createRoot();
	await act(async () => {
		root.render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
	});
	await act(async () => {
		await expect(queryClient.fetchQuery(options)).rejects.toThrow("Submission read failed");
	});
	expect(markup()).toContain("Local approval is unavailable");
	expect(markup()).toContain("Submission read failed");
	expect(markup()).toContain("Retry local reviews");
	expect(markup()).not.toContain('data-pr-state="open"');
	expect(markup()).not.toContain("Ready for review");
	await act(async () => retry());
	expect(markup()).toContain("Locally approved");
	expect(markup()).not.toContain("Submission read failed");
	expect(calls).toBe(2);
	await act(async () => root.unmount());
	queryClient.clear();
});
