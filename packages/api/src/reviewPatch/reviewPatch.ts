// The lines a unified diff shows for one file, by line number and side. A
// suggestion needs the exact text of the lines it replaces, and the patch of
// the reviewed revision holds that text for every line inside a hunk.

const escapeBytes: Record<string, number> = { b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 };

// A path with a space or a non-ASCII byte comes quoted, with C escapes.
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
		const escaped = quoted[++index]!;
		if (/[0-7]/.test(escaped)) {
			const octal = `${escaped}${quoted[index + 1] ?? ""}${quoted[index + 2] ?? ""}`.match(/^[0-7]{1,3}/)![0];
			bytes.push(Number.parseInt(octal, 8));
			index += octal.length - 1;
			continue;
		}
		bytes.push(escapeBytes[escaped] ?? escaped.charCodeAt(0));
	}
	return new TextDecoder().decode(Uint8Array.from(bytes));
};

// The new path of one file section, from its `+++` header, or from the
// `diff --git` header of a deleted file.
const sectionPath = (section: string) => {
	const lines = section.split("\n");
	const plus = lines.find((line) => line.startsWith("+++ "));
	const raw = plus?.slice(4).split("\t", 1)[0];
	if (raw !== undefined && raw !== "/dev/null") {
		const value = decodeGitPath(raw);
		return value.startsWith("b/") ? value.slice(2) : value;
	}
	const header = lines[0]!.slice("diff --git ".length).match(/"(?:\\.|[^"])*"|\S+/g);
	const last = header?.at(-1);
	if (last === undefined) return undefined;
	const value = decodeGitPath(last);
	return value.startsWith("b/") ? value.slice(2) : value;
};

// The text of the lines `startLine` to `line` on one side of `path`, or
// null when the patch does not show one of them.
export function patchLines(
	patch: string,
	path: string,
	side: "old" | "new",
	startLine: number,
	line: number,
): string[] | null {
	const section = patch
		.split(/^diff --git /m)
		.slice(1)
		.map((body) => `diff --git ${body}`)
		.find((body) => sectionPath(body) === path);
	if (section === undefined) return null;
	const found = new Map<number, string>();
	let oldLine = 0;
	let newLine = 0;
	let inHunk = false;
	for (const raw of section.split("\n")) {
		const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
		if (hunk !== null) {
			oldLine = Number(hunk[1]);
			newLine = Number(hunk[2]);
			inHunk = true;
			continue;
		}
		if (!inHunk || raw.startsWith("\\ No newline")) continue;
		const prefix = raw[0];
		if (prefix !== " " && prefix !== "+" && prefix !== "-") continue;
		const text = raw.slice(1).replace(/\r$/, "");
		if (prefix === " " || prefix === "-") {
			if (side === "old") found.set(oldLine, text);
			oldLine += 1;
		}
		if (prefix === " " || prefix === "+") {
			if (side === "new") found.set(newLine, text);
			newLine += 1;
		}
	}
	const lines: string[] = [];
	for (let number = startLine; number <= line; number += 1) {
		const text = found.get(number);
		if (text === undefined) return null;
		lines.push(text);
	}
	return lines;
}
