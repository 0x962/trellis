import type { ListQueryInput } from "@trellis/api";

type Flag = { key: keyof ListQueryInput; flag: string; list?: boolean; boolean?: boolean };

// One flag per list field, in the order the command prints them. A list
// field is a comma list on the command line, as in the URL.
const flags: readonly Flag[] = [
	{ key: "project", flag: "--project" },
	{ key: "status", flag: "--status", list: true },
	{ key: "category", flag: "--category", list: true },
	{ key: "reviewer", flag: "--reviewer" },
	{ key: "priority", flag: "--priority", list: true },
	{ key: "parent", flag: "--parent" },
	{ key: "pr", flag: "--pr" },
	{ key: "ci", flag: "--ci", list: true },
	{ key: "actor", flag: "--actor" },
	{ key: "q", flag: "--q" },
	{ key: "updated", flag: "--updated" },
	{ key: "created", flag: "--created" },
	{ key: "completed", flag: "--completed" },
	{ key: "sort", flag: "--sort" },
	{ key: "limit", flag: "--limit" },
	{ key: "subprojects", flag: "--subprojects", boolean: true },
];

const quote = (value: string) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);

// The `trellis list` command that returns the rows of a query.
export const toCli = (query: ListQueryInput): string => {
	const parts = ["trellis", "list"];
	for (const { key, flag, list } of flags) {
		const value = query[key];
		if (value === undefined) continue;
		const text = list && Array.isArray(value) ? value.join(",") : String(value);
		parts.push(flag, quote(text));
	}
	return parts.join(" ");
};

// The words of a command line. A double-quoted word keeps its spaces.
const words = (command: string) =>
	[...command.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((match) =>
		match[1] === undefined ? match[2]! : match[1].replace(/\\"/g, '"'),
	);

// The query of a `trellis list` command, as `toCli` printed it.
export const parseCli = (command: string): ListQueryInput => {
	const query: Record<string, unknown> = {};
	const tokens = words(command).slice(2);
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index]!;
		const entry = flags.find((flag) => flag.flag === token)!;
		index += 1;
		const value = tokens[index]!;
		query[entry.key] = entry.boolean
			? value !== "false"
			: entry.list
				? value.split(",")
				: entry.key === "limit"
					? Number(value)
					: value;
	}
	return query as ListQueryInput;
};
