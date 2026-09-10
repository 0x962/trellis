import { stripDefaults, type View } from "./grammar";

// A flag per list field. The value is the URL value: a comma list stays a
// comma list, a relative time bound stays `7d`.
const flags: Partial<Record<keyof View, string>> = {
	status: "--status",
	category: "--category",
	reviewer: "--reviewer",
	priority: "--priority",
	parent: "--parent",
	pr: "--pr",
	ci: "--ci",
	actor: "--actor",
	q: "--q",
	updated: "--updated",
	created: "--created",
	completed: "--completed",
	sort: "--sort",
	limit: "--limit",
};

const quote = (value: string) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);

// The `trellis list` command that returns the same rows as the view.
// `project` is the API ref of the project route, or undefined on /all.
export const toCliCommand = (view: View, project?: string): string => {
	const parts = ["trellis", "list"];
	if (project !== undefined) parts.push("-p", project);
	if (view.scope === "self") parts.push("--no-subprojects");
	const stripped = stripDefaults(view);
	for (const [key, flag] of Object.entries(flags) as [keyof View, string][]) {
		const value = stripped[key];
		if (value === undefined) continue;
		parts.push(flag, quote(Array.isArray(value) ? value.join(",") : String(value)));
	}
	return parts.join(" ");
};
