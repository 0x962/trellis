import { z } from "zod";
import { pickErrors } from "../errors";
import { ProjectRefStringSchema } from "../refs";
import { UlidSchema } from "../schemas/primitives";
import { PullRequestSchema } from "../schemas/pullRequest";
import {
	ReactionKeySchema,
	ReviewApplyResultSchema,
	ReviewApplySchema,
	ReviewBodySchema,
	ReviewCreateSchema,
	ReviewListSchema,
	ReviewPageSchema,
	ReviewPrSchema,
	ReviewRefSchema,
	ReviewRevisionSchema,
	ReviewStatusSchema,
	ReviewSubmissionSchema,
	ReviewSubmitResultSchema,
	ReviewSubmitSchema,
	ReviewThreadSchema,
} from "../schemas/review";
import { base } from "./base";

const id = z.object({ id: z.string().min(1) });
const pr = z.object({ pr: ReviewRefSchema });
// A project narrows a list to the pull requests of that project: the ones
// linked to a ticket of the project, and the ones in a repository of the
// project.
const project = z.object({ project: ProjectRefStringSchema.optional() });
export const reviews = {
	status: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/status", summary: "Read current GitHub PR status" })
		.input(pr)
		.output(ReviewStatusSchema),
	action: base
		.errors(pickErrors(["GH_UNAVAILABLE", "PR_HEAD_MOVED"]))
		.route({ method: "POST", path: "/reviews/action", summary: "Run an explicit GitHub action" })
		.input(
			pr.extend({
				action: z.enum([
					"merge",
					"admin-merge",
					"automerge",
					"disable-automerge",
					"queue",
					"dequeue",
					"close",
					"ready",
					"update-branch",
				]),
				headSha: z.string().min(1),
			}),
		)
		.output(PullRequestSchema),
	mine: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/mine", summary: "List the signed-in user's open PRs" })
		.input(project)
		.output(
			z.array(
				z.object({
					number: z.number(),
					title: z.string(),
					repository: z.object({ nameWithOwner: z.string() }),
					isDraft: z.boolean(),
					url: z.string(),
				}),
			),
		),
	metadata: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/metadata", summary: "Read stack and queue options" })
		.input(pr)
		.output(z.record(z.string(), z.unknown())),
	export: base
		.route({ method: "GET", path: "/reviews/export", summary: "Export a complete local review" })
		.input(pr)
		.output(
			z.object({
				version: z.literal(1),
				url: z.string(),
				threads: z.array(ReviewThreadSchema),
				revisions: z.array(ReviewRevisionSchema),
				submissions: z.array(ReviewSubmissionSchema),
			}),
		),
	refresh: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/refresh", summary: "Fetch a complete PR revision" })
		.input(pr)
		.output(ReviewRevisionSchema),
	revision: base
		.route({ method: "GET", path: "/reviews/revision", summary: "Read a saved PR revision" })
		.input(pr.extend({ id: UlidSchema.optional() }))
		.output(ReviewRevisionSchema.nullable()),
	file: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/file", summary: "Read a file at the reviewed commit" })
		.input(pr.extend({ revisionId: UlidSchema, path: z.string().min(1), side: z.enum(["old", "new"]) }))
		.output(z.object({ content: z.string() })),
	open: base
		.route({ method: "POST", path: "/reviews/open", summary: "Keep a PR for local review" })
		.input(pr)
		.output(z.object({ id: UlidSchema, url: z.string() })),
	prs: base
		.route({ method: "GET", path: "/reviews/prs", summary: "List local PR reviews, or the PRs of one project" })
		.input(project.extend({ all: z.boolean().optional() }))
		.output(z.array(ReviewPrSchema)),
	list: base
		.route({ method: "GET", path: "/reviews/threads", summary: "Read local review threads" })
		.input(ReviewListSchema)
		.output(ReviewPageSchema),
	thread: base
		.route({ method: "GET", path: "/reviews/threads/{id}", summary: "Read a local review thread" })
		.input(id)
		.output(ReviewThreadSchema),
	add: base
		.route({ method: "POST", path: "/reviews/threads", successStatus: 201, summary: "Add a local review thread" })
		.input(ReviewCreateSchema)
		.output(ReviewThreadSchema),
	reply: base
		.route({ method: "POST", path: "/reviews/threads/{id}/reply", summary: "Reply to a local review thread" })
		.input(id.extend({ body: ReviewBodySchema }))
		.output(ReviewThreadSchema),
	resolve: base
		.route({
			method: "POST",
			path: "/reviews/threads/{id}/resolve",
			summary: "Resolve or reopen a local review thread",
		})
		.input(id.extend({ resolved: z.boolean() }))
		.output(ReviewThreadSchema),
	edit: base
		.errors(pickErrors(["REVIEW_VERSION_CONFLICT"]))
		.route({ method: "PATCH", path: "/reviews/messages/{id}", summary: "Edit a local review message" })
		.input(id.extend({ body: ReviewBodySchema, expectedVersion: z.number().int().positive() }))
		.output(ReviewThreadSchema),
	reaction: base
		.route({ method: "POST", path: "/reviews/messages/{id}/reaction", summary: "Add or remove a local reaction" })
		.input(id.extend({ reaction: ReactionKeySchema, remove: z.boolean().default(false) }))
		.output(ReviewThreadSchema),
	submissions: base
		.route({ method: "GET", path: "/reviews/submissions", summary: "Read the local verdicts of a PR, newest first" })
		.input(pr)
		.output(z.array(ReviewSubmissionSchema)),
	submit: base
		.route({ method: "POST", path: "/reviews/submit", summary: "Save and deliver a local pull request verdict" })
		.input(ReviewSubmitSchema)
		.output(ReviewSubmitResultSchema),
	apply: base
		.errors(pickErrors(["GH_UNAVAILABLE", "PR_HEAD_MOVED", "REVIEW_SUGGESTION_STALE"]))
		.route({ method: "POST", path: "/reviews/apply", summary: "Commit suggested changes to the head branch" })
		.input(ReviewApplySchema)
		.output(ReviewApplyResultSchema),
};
