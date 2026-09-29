import { decodeCursor, encodeCursor } from "../../../db/queries/support.ts";
import { invalidInput } from "../../../errors.ts";
import { git } from "./git.ts";
import { gitRecordPage } from "./gitRecordPage.ts";
import { gitTextPage } from "./gitTextPage.ts";

const filePageSize = 200;
const diffPageBytes = 262144;
const digestPattern = /^[0-9a-f]{64}$/;

type WorkspaceCursor = {
	format: 1;
	phase: "files" | "diff";
	offset: number;
	filesDigest: string;
	diffDigest: string;
};

const readCursor = (value: string): WorkspaceCursor => {
	let parsed: unknown;
	try {
		parsed = decodeCursor(value);
	} catch {
		throw invalidInput("cursor", "Use a cursor from the previous workspace page.");
	}
	const cursor = parsed as Partial<WorkspaceCursor> | null;
	if (
		cursor === null ||
		cursor.format !== 1 ||
		(cursor.phase !== "files" && cursor.phase !== "diff") ||
		typeof cursor.offset !== "number" ||
		!Number.isSafeInteger(cursor.offset) ||
		cursor.offset < 0 ||
		typeof cursor.filesDigest !== "string" ||
		!digestPattern.test(cursor.filesDigest) ||
		typeof cursor.diffDigest !== "string" ||
		!digestPattern.test(cursor.diffDigest)
	)
		throw invalidInput("cursor", "Use a cursor from the previous workspace page.");
	return cursor as WorkspaceCursor;
};

const cursorOf = (cursor: WorkspaceCursor) => encodeCursor(cursor);

const filesArgs = ["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate", "-z"];
const diffArgs = ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--"];

export const readWorkspaceChanges = async (workspace: string, value?: string) => {
	const cursor = value === undefined ? undefined : readCursor(value);
	const phase = cursor?.phase ?? "files";
	const offset = cursor?.offset ?? 0;
	const filePage = await gitRecordPage(workspace, filesArgs, {
		offset: phase === "files" ? offset : 0,
		limit: phase === "files" ? filePageSize : 0,
	});
	const diffPage = await gitTextPage(workspace, diffArgs, {
		offset: phase === "diff" ? offset : 0,
		limit: phase === "diff" ? diffPageBytes : 0,
	});
	if (cursor !== undefined && (cursor.filesDigest !== filePage.digest || cursor.diffDigest !== diffPage.digest))
		throw invalidInput("cursor", "The workspace changed. Start again without a cursor.");
	if (
		cursor !== undefined &&
		((phase === "files" && offset > filePage.total) ||
			(phase === "diff" && (offset > diffPage.totalBytes || !diffPage.validOffset)))
	)
		throw invalidInput("cursor", "Use a cursor from the previous workspace page.");

	const filesDigest = filePage.digest;
	const diffDigest = diffPage.digest;
	if (phase === "diff") {
		const nextCursor =
			diffPage.nextOffset < diffPage.totalBytes
				? cursorOf({ format: 1, phase, offset: diffPage.nextOffset, filesDigest, diffDigest })
				: null;
		return { phase, files: [], diff: diffPage.text, truncated: false, nextCursor };
	}

	const status =
		filePage.items.length === 0
			? ""
			: await git(workspace, [
					"status",
					"--porcelain=v1",
					"-z",
					"--untracked-files=all",
					"--no-renames",
					"--",
					...filePage.items.map((path) => `:(literal)${path}`),
				]);
	const states = new Map(
		status
			.split("\0")
			.filter(Boolean)
			.map((entry) => [entry.slice(3), entry.slice(0, 2)]),
	);
	const nextOffset = offset + filePage.items.length;
	const nextCursor =
		nextOffset < filePage.total
			? cursorOf({ format: 1, phase, offset: nextOffset, filesDigest, diffDigest })
			: diffPage.totalBytes > 0
				? cursorOf({ format: 1, phase: "diff", offset: 0, filesDigest, diffDigest })
				: null;
	return {
		phase,
		files: filePage.items.map((path) => ({ path, status: states.get(path) ?? "  " })),
		diff: "",
		truncated: false,
		nextCursor,
	};
};
