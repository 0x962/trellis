import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	PullRequestEvidenceSchema,
	PullRequestEvidenceWriteInputSchema,
	PullRequestFileIdInputSchema,
	PullRequestFileSchema,
	PullRequestFileUploadInputSchema,
} from "../schemas/evidence.ts";
import {
	LinkedPullRequestSchema,
	PullRequestDiffOutputSchema,
	PullRequestIdInputSchema,
	PullRequestLinkInputSchema,
	PullRequestListInputSchema,
	PullRequestResolveInputSchema,
	PullRequestResolveOutputSchema,
	PullRequestSchema,
	PullRequestSetLocalStateInputSchema,
	PullRequestSummaryHeadInputSchema,
	PullRequestSummarySchema,
	PullRequestSummaryWriteInputSchema,
	PullRequestSummaryWriteOutputSchema,
	PullRequestUnlinkInputSchema,
	PullRequestUnlinkOutputSchema,
} from "../schemas/pullRequest.ts";
import { base } from "./base.ts";

export const pullRequests = {
	resolve: base
		.errors(pickErrors(["NOT_FOUND", "INPUT_VALIDATION_FAILED"]))
		.route({ method: "GET", path: "/prs/resolve", summary: "Resolve a pull request ref known to Trellis" })
		.input(PullRequestResolveInputSchema)
		.output(PullRequestResolveOutputSchema),
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
	setLocalState: base
		.errors(pickErrors(["NOT_FOUND"]))
		.route({
			method: "PUT",
			path: "/prs/{id}/local-state",
			summary: "Mark a pull request as a draft or ready for review",
		})
		.input(PullRequestSetLocalStateInputSchema)
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
	readEvidence: base
		.route({ method: "GET", path: "/prs/{id}/evidence", summary: "Read the evidence document of a pull request" })
		.input(PullRequestIdInputSchema)
		.output(PullRequestEvidenceSchema.nullable()),
	writeEvidence: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "PUT", path: "/prs/{id}/evidence", summary: "Write the evidence document of a pull request" })
		.input(PullRequestEvidenceWriteInputSchema)
		.output(PullRequestEvidenceSchema),
	readFile: base
		.route({ method: "GET", path: "/pr-files/{fileId}", summary: "Read one pull request file" })
		.input(PullRequestFileIdInputSchema)
		.output(PullRequestFileSchema),
	uploadFile: base
		.errors(pickErrors(["DUPLICATE", "PAYLOAD_TOO_LARGE"]))
		.route({
			method: "PUT",
			path: "/prs/{id}/files/{fileId}",
			summary: "Upload a file that a summary or an evidence document shows",
		})
		.input(PullRequestFileUploadInputSchema)
		.output(PullRequestFileSchema),
};
