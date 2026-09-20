import { z } from "zod";
import { pickErrors } from "../errors.ts";
import { EvidenceIdInputSchema, EvidenceSchema, EvidenceWriteInputSchema } from "../schemas/evidence.ts";
import {
	LinkedPullRequestSchema,
	PullRequestDiffOutputSchema,
	PullRequestIdInputSchema,
	PullRequestLinkInputSchema,
	PullRequestListInputSchema,
	PullRequestSchema,
	PullRequestSummaryHeadInputSchema,
	PullRequestSummarySchema,
	PullRequestSummaryWriteInputSchema,
	PullRequestSummaryWriteOutputSchema,
	PullRequestUnlinkInputSchema,
	PullRequestUnlinkOutputSchema,
} from "../schemas/pullRequest.ts";
import { base } from "./base.ts";

export const pullRequests = {
	list: base
		.route({ method: "GET", path: "/tickets/{ticket}/prs", summary: "List the pull requests on a ticket" })
		.input(PullRequestListInputSchema)
		.output(z.array(LinkedPullRequestSchema)),
	link: base
		.errors(pickErrors(["INVALID_PR_URL", "GH_UNAVAILABLE", "PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/tickets/{ticket}/prs", summary: "Link a pull request by URL" })
		.input(PullRequestLinkInputSchema)
		.output(LinkedPullRequestSchema),
	unlink: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "DELETE", path: "/tickets/{ticket}/prs/{id}", summary: "Remove a pull request from a ticket" })
		.input(PullRequestUnlinkInputSchema)
		.output(PullRequestUnlinkOutputSchema),
	refresh: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/prs/{id}/refresh", summary: "Poll one pull request now" })
		.input(PullRequestIdInputSchema)
		.output(PullRequestSchema),
	diff: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "GET", path: "/prs/{id}/diff", summary: "Read the diff, cut at 1 MB" })
		.input(PullRequestIdInputSchema)
		.output(PullRequestDiffOutputSchema),
	readSummary: base
		.route({ method: "GET", path: "/prs/{id}/summary", summary: "Read the newest summary of a pull request" })
		.input(PullRequestIdInputSchema)
		.output(PullRequestSummarySchema.nullable()),
	readSummaryHead: base
		.route({ method: "GET", path: "/prs/{id}/summaries/{headSha}", summary: "Read one pull request summary" })
		.input(PullRequestSummaryHeadInputSchema)
		.output(PullRequestSummarySchema.nullable()),
	writeSummary: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "PUT", path: "/prs/{id}/summaries/{headSha}", summary: "Write one pull request summary" })
		.input(PullRequestSummaryWriteInputSchema)
		.output(PullRequestSummaryWriteOutputSchema),
	listEvidence: base
		.route({ method: "GET", path: "/prs/{id}/evidence", summary: "List the evidence of a pull request" })
		.input(PullRequestIdInputSchema)
		.output(z.array(EvidenceSchema)),
	readEvidence: base
		.route({ method: "GET", path: "/evidence/{evidenceId}", summary: "Read one evidence record" })
		.input(EvidenceIdInputSchema)
		.output(EvidenceSchema),
	writeEvidence: base
		.errors(pickErrors(["DUPLICATE", "GH_UNAVAILABLE", "PAYLOAD_TOO_LARGE", "PR_HEAD_MOVED"]))
		.route({
			method: "PUT",
			path: "/prs/{id}/evidence/{evidenceId}",
			summary: "Register evidence for one pull request head",
		})
		.input(EvidenceWriteInputSchema)
		.output(EvidenceSchema),
};
