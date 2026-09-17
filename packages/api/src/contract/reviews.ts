import { z } from "zod";
import { pickErrors } from "../errors";
import { UlidSchema } from "../schemas/primitives";
import { PullRequestSchema } from "../schemas/pullRequest";
import {
	ReactionKeySchema,
	ReviewBodySchema,
	ReviewCreateSchema,
	ReviewListSchema,
	ReviewPageSchema,
	ReviewPrSchema,
	ReviewRefSchema,
	ReviewRevisionSchema,
	ReviewSubmissionSchema,
	ReviewSubmitSchema,
	ReviewThreadSchema,
} from "../schemas/review";
import { ReviewImportResultSchema, ReviewImportSchema } from "../schemas/reviewImport";
import { base } from "./base";

const id = z.object({ id: z.string().min(1) });
const pr = z.object({ pr: ReviewRefSchema });
export const reviews = {
	status: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/status", summary: "Read current GitHub PR status" })
		.input(pr)
		.output(z.record(z.string(), z.unknown())),
	runs: base
		.route({ method: "POST", path: "/reviews/runs", summary: "Control review graph runs" })
		.input(
			pr.extend({
				action: z.enum(["list", "start", "show", "node", "resume", "retry", "answer"]),
				runId: z
					.string()
					.regex(/^[\w-]+$/)
					.optional(),
				nodeId: z
					.string()
					.regex(/^[\w-]+$/)
					.optional(),
				cwd: z.string().optional(),
				approve: z.boolean().optional(),
				note: z.string().optional(),
			}),
		)
		.output(z.record(z.string(), z.unknown())),
	action: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
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
					"deploy-on",
					"deploy-off",
					"live-create",
					"live-deploy",
					"live-delete",
					"live-enable",
					"live-disable",
					"live-persist",
					"live-unpersist",
				]),
				headSha: z.string().min(1),
			}),
		)
		.output(PullRequestSchema),
	mine: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/mine", summary: "List the signed-in user's open PRs" })
		.input(z.object({}))
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
		.route({ method: "POST", path: "/reviews/metadata", summary: "Read stack, queue, and deployment options" })
		.input(pr)
		.output(z.record(z.string(), z.unknown())),
	importMargin: base
		.route({ method: "POST", path: "/reviews/import-margin", summary: "Import local Margin comments" })
		.input(ReviewImportSchema)
		.output(ReviewImportResultSchema),
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
				imports: z.array(z.record(z.string(), z.unknown())),
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
		.route({ method: "GET", path: "/reviews/prs", summary: "List local PR reviews" })
		.input(z.object({}))
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
	submit: base
		.errors(pickErrors(["GH_UNAVAILABLE"]))
		.route({ method: "POST", path: "/reviews/submit", summary: "Submit a pull request review" })
		.input(ReviewSubmitSchema)
		.output(PullRequestSchema),
};
