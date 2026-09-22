import { parseGhJsonResult } from "./json.ts";
import type { GhRunner } from "./run.ts";

// The first lines of the failure output of one check, as GitHub gives them.
// GitHub keeps the output of a check run as annotations, and a GitHub
// Actions job writes each error line it sees there. The job log itself is a
// download of megabytes, so the message carries the annotations only.
//
// A check whose link names no check run id (a commit status, or a check app
// with its own site) gives no lines. A gh call that fails also gives no
// lines: the message still names the check and its link.

export const MAX_FAILURE_LINES = 5;
const MAX_LINE_LENGTH = 200;

type Annotation = { annotation_level: string; message: string; path: string; start_line: number | null };

// An Actions link is `.../actions/runs/<run>/job/<job>`, and the job id is
// the check run id. A check app link is `https://github.com/<o>/<r>/runs/<id>`.
export const checkRunIdOf = (link: string | null): string | null => {
	if (link === null) return null;
	const job = /\/job\/(\d+)(?:[/?#]|$)/.exec(link);
	if (job !== null) return job[1]!;
	const run = /^https:\/\/github\.com\/[^/]+\/[^/]+\/runs\/(\d+)(?:[/?#]|$)/.exec(link);
	return run === null ? null : run[1]!;
};

// A failure annotation that names a file reads `path:line message`. GitHub
// puts an annotation without a file on `.github`, so that one reads as the
// message alone.
const linesOf = (annotation: Annotation) => {
	const place =
		annotation.path === ".github"
			? ""
			: `${annotation.path}${annotation.start_line ? `:${annotation.start_line}` : ""} `;
	return annotation.message
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.map((line, index) => (index === 0 ? `${place}${line}` : line));
};

export const failureLines = async (
	gh: GhRunner,
	ref: { owner: string; repo: string },
	link: string | null,
): Promise<string[]> => {
	const id = checkRunIdOf(link);
	if (id === null) return [];
	const result = await gh("poller", ["api", `repos/${ref.owner}/${ref.repo}/check-runs/${id}/annotations`]);
	if (!result.ok) return [];
	const parsed = parseGhJsonResult<Annotation[]>(
		["api", `repos/${ref.owner}/${ref.repo}/check-runs/${id}/annotations`],
		result.stdout,
		result.code,
	);
	if (!parsed.ok) return [];
	const annotations = parsed.value;
	return annotations
		.filter((annotation) => annotation.annotation_level === "failure")
		.flatMap(linesOf)
		.slice(0, MAX_FAILURE_LINES)
		.map((line) => line.slice(0, MAX_LINE_LENGTH));
};
