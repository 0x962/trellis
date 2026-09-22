import { z } from "zod";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

const HeadShaSchema = z.string().min(1).max(64);

// The evidence document of a pull request: one Markdown text that the agent
// writes to show the change working. A new write replaces the text. `headSha`
// names the pull request head at the time of the write.
export const PullRequestEvidenceSchema = z.object({
	pullRequestId: UlidSchema,
	headSha: HeadShaSchema,
	body: z.string().min(1),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type PullRequestEvidence = z.infer<typeof PullRequestEvidenceSchema>;

export const PullRequestEvidenceWriteInputSchema = z.strictObject({
	id: UlidSchema,
	headSha: HeadShaSchema,
	body: z.string().trim().min(1),
});

// A file that a summary or an evidence document shows, such as a screenshot.
// `url` is the path that the Markdown image points at.
export const PullRequestFileSchema = z.object({
	id: UlidSchema,
	pullRequestId: UlidSchema,
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	url: z.string().min(1),
	filename: z.string().min(1),
	mime: z.string().min(1),
	size: z.number().int().nonnegative(),
});
export type PullRequestFile = z.infer<typeof PullRequestFileSchema>;

export const PullRequestFileIdInputSchema = z.strictObject({
	fileId: UlidSchema,
});

export const PullRequestFileUploadInputSchema = z.strictObject({
	id: UlidSchema,
	fileId: UlidSchema,
	file: z.file(),
});
