export type ReviewHunkContent =
	| { type: "context"; lines: number; deletionLineIndex: number; additionLineIndex: number }
	| { type: "change"; deletions: number; additions: number; deletionLineIndex: number; additionLineIndex: number };

export type ReviewHunk = {
	deletionStart: number;
	deletionCount: number;
	additionStart: number;
	additionCount: number;
	deletionLineIndex: number;
	additionLineIndex: number;
	deletionLines: number;
	additionLines: number;
	hunkContent: ReviewHunkContent[];
	hunkSpecs: string;
};

export type ReviewFile = {
	name: string;
	prevName?: string;
	type: "change" | "new" | "deleted" | "rename-pure" | "rename-changed";
	deletionLines: string[];
	additionLines: string[];
	hunks: ReviewHunk[];
};

const pathFromHeader = (line: string | undefined, prefix: "a/" | "b/") => {
	const value = line?.slice(4).split("\t", 1)[0];
	if (!value || value === "/dev/null") return undefined;
	return value.startsWith(prefix) ? value.slice(2) : value;
};

const count = (value: string | undefined) => (value === undefined ? 1 : Number(value));

const parseFile = (source: string): ReviewFile => {
	const lines = source.split("\n");
	const firstHunk = lines.findIndex((line) => line.startsWith("@@ "));
	const headers = lines.slice(0, firstHunk === -1 ? lines.length : firstHunk);
	const oldPath = pathFromHeader(
		headers.find((line) => line.startsWith("--- ")),
		"a/",
	);
	const newPath = pathFromHeader(
		headers.find((line) => line.startsWith("+++ ")),
		"b/",
	);
	const renamedFrom = headers.find((line) => line.startsWith("rename from "))?.slice(12);
	const renamedTo = headers.find((line) => line.startsWith("rename to "))?.slice(10);
	const added = headers.some((line) => line.startsWith("new file mode"));
	const deleted = headers.some((line) => line.startsWith("deleted file mode"));
	const renamed = renamedFrom !== undefined || renamedTo !== undefined;
	const name = renamedTo ?? newPath ?? oldPath!;
	const file: ReviewFile = {
		name,
		...(added ? {} : { prevName: renamedFrom ?? oldPath ?? name }),
		type: added
			? "new"
			: deleted
				? "deleted"
				: renamed
					? headers.includes("similarity index 100%")
						? "rename-pure"
						: "rename-changed"
					: "change",
		deletionLines: [],
		additionLines: [],
		hunks: [],
	};
	for (let index = firstHunk; index >= 0 && index < lines.length; ) {
		const specs = lines[index]!;
		const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(specs)!;
		const hunk: ReviewHunk = {
			deletionStart: Number(match[1]),
			deletionCount: count(match[2]),
			additionStart: Number(match[3]),
			additionCount: count(match[4]),
			deletionLineIndex: file.deletionLines.length,
			additionLineIndex: file.additionLines.length,
			deletionLines: 0,
			additionLines: 0,
			hunkContent: [],
			hunkSpecs: specs,
		};
		index += 1;
		while (index < lines.length && !lines[index]!.startsWith("@@ ")) {
			const raw = lines[index++]!;
			if (raw.startsWith("\\ No newline")) continue;
			const prefix = raw[0];
			if (prefix !== " " && prefix !== "+" && prefix !== "-") continue;
			const value = raw.slice(1);
			if (prefix === " ") {
				const previous = hunk.hunkContent.at(-1);
				if (previous?.type === "context") previous.lines += 1;
				else
					hunk.hunkContent.push({
						type: "context",
						lines: 1,
						deletionLineIndex: file.deletionLines.length,
						additionLineIndex: file.additionLines.length,
					});
				file.deletionLines.push(value);
				file.additionLines.push(value);
				continue;
			}
			let change = hunk.hunkContent.at(-1);
			if (change?.type !== "change") {
				change = {
					type: "change",
					deletions: 0,
					additions: 0,
					deletionLineIndex: file.deletionLines.length,
					additionLineIndex: file.additionLines.length,
				};
				hunk.hunkContent.push(change);
			}
			if (prefix === "-") {
				change.deletions += 1;
				hunk.deletionLines += 1;
				file.deletionLines.push(value);
			} else {
				change.additions += 1;
				hunk.additionLines += 1;
				file.additionLines.push(value);
			}
		}
		file.hunks.push(hunk);
	}
	return file;
};

export function parseReviewFiles(patch: string): ReviewFile[] {
	return patch
		.split(/^diff --git /m)
		.slice(1)
		.map((source) => parseFile(`diff --git ${source}`));
}
