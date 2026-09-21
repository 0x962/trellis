// The most a target holds. The target rides in the observation of every
// agent run, which the server sends to every open page on each change, and
// one row of a table draws one line of it.
const maxLength = 120;

// The keys of a tool input that name what the tool works on, in the order a
// reader wants them. Each harness sends the tool input of its own provider,
// so an input can carry any of these names, or none of them.
const targetKeys = [
	"command",
	"file_path",
	"filePath",
	"path",
	"notebook_path",
	"url",
	"pattern",
	"query",
	"description",
];

const oneLine = (text: string) => text.split("\n", 1)[0]!.trim();

const shorten = (text: string) => (text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`);

// The short target of a tool call: the file an edit writes, the command a
// shell call runs, the address a fetch reads. A tool input can hold a whole
// file, so the target takes the first line of the first key it finds and
// cuts it to `maxLength` characters. It is null for an input that names no
// target, and the caller then shows the tool name alone.
export const toolTarget = (input: unknown): string | null => {
	if (typeof input !== "object" || input === null) return null;
	const fields = input as Record<string, unknown>;
	for (const key of targetKeys) {
		const value = fields[key];
		const text = typeof value === "string" ? value : null;
		const words = Array.isArray(value) && value.every((part) => typeof part === "string") ? value.join(" ") : text;
		if (words === null) continue;
		const line = oneLine(words);
		if (line !== "") return shorten(line);
	}
	return null;
};
