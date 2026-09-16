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

const escapeBytes: Record<string, number> = {
	b: 8,
	f: 12,
	n: 10,
	r: 13,
	t: 9,
	v: 11,
};

const decodeGitPath = (value: string) => {
	if (!value.startsWith('"')) return value;
	const bytes: number[] = [];
	const quoted = value.slice(1, -1);
	for (let index = 0; index < quoted.length; index += 1) {
		const character = quoted[index]!;
		if (character !== "\\") {
			bytes.push(...new TextEncoder().encode(character));
			continue;
		}
		const escape = quoted[++index]!;
		if (/[0-7]/.test(escape)) {
			const octal = `${escape}${quoted[index + 1] ?? ""}${quoted[index + 2] ?? ""}`.match(/^[0-7]{1,3}/)![0];
			bytes.push(Number.parseInt(octal, 8));
			index += octal.length - 1;
			continue;
		}
		bytes.push(escapeBytes[escape] ?? escape.charCodeAt(0));
	}
	return new TextDecoder().decode(Uint8Array.from(bytes));
};

const headerPaths = (line: string) => {
	const values = line.slice("diff --git ".length).match(/"(?:\\.|[^"])*"|\S+/g)!;
	return values.map(decodeGitPath) as [string, string];
};

const pathFromHeader = (line: string | undefined, prefix: "a/" | "b/") => {
	const raw = line?.slice(4).split("\t", 1)[0];
	const value = raw ? decodeGitPath(raw) : undefined;
	if (!value || value === "/dev/null") return undefined;
	return value.startsWith(prefix) ? value.slice(2) : value;
};

const count = (value: string | undefined) => (value === undefined ? 1 : Number(value));

const parseFile = (source: string): ReviewFile => {
	const lines = source.split("\n");
	const firstHunk = lines.findIndex((line) => line.startsWith("@@ "));
	const headers = lines.slice(0, firstHunk === -1 ? lines.length : firstHunk);
	const [headerOldPath, headerNewPath] = headerPaths(lines[0]!);
	const oldPath = pathFromHeader(
		headers.find((line) => line.startsWith("--- ")),
		"a/",
	);
	const newPath = pathFromHeader(
		headers.find((line) => line.startsWith("+++ ")),
		"b/",
	);
	const renamedFromValue = headers.find((line) => line.startsWith("rename from "))?.slice(12);
	const renamedToValue = headers.find((line) => line.startsWith("rename to "))?.slice(10);
	const renamedFrom = renamedFromValue ? decodeGitPath(renamedFromValue) : undefined;
	const renamedTo = renamedToValue ? decodeGitPath(renamedToValue) : undefined;
	const added = headers.some((line) => line.startsWith("new file mode"));
	const deleted = headers.some((line) => line.startsWith("deleted file mode"));
	const renamed = renamedFrom !== undefined || renamedTo !== undefined;
	const fallbackOldPath = headerOldPath.startsWith("a/") ? headerOldPath.slice(2) : headerOldPath;
	const fallbackNewPath = headerNewPath.startsWith("b/") ? headerNewPath.slice(2) : headerNewPath;
	const name = renamedTo ?? newPath ?? oldPath ?? fallbackNewPath;
	const file: ReviewFile = {
		name,
		...(added ? {} : { prevName: renamedFrom ?? oldPath ?? fallbackOldPath }),
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
		const deletionCount = hunk.hunkContent.reduce(
			(total, content) => total + (content.type === "context" ? content.lines : content.deletions),
			0,
		);
		const additionCount = hunk.hunkContent.reduce(
			(total, content) => total + (content.type === "context" ? content.lines : content.additions),
			0,
		);
		if (deletionCount !== hunk.deletionCount || additionCount !== hunk.additionCount)
			throw new Error(`Invalid hunk line counts in ${name}`);
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
