import type { Waiting } from "@trellis/api";

export const readyGroupOrder = [
	{ waiting: "merge", label: "waits on a merge" },
	{ waiting: "you", label: "waits for you" },
	{ waiting: "agent", label: "with an agent" },
	{ waiting: "github", label: "with GitHub" },
] as const satisfies readonly { waiting: Waiting; label: string }[];

type ReadyGroup = {
	waiting: (typeof readyGroupOrder)[number]["waiting"];
	label: string;
	count: number;
	names: string[];
};

export type ReadyResult = {
	readyToStart: { count: number; identifiers: string[] };
	groups: ReadyGroup[];
};

export const readyText = (result: ReadyResult): string => {
	const countLine = `${result.readyToStart.count} ready to start`;
	if (result.groups.length === 0) return `${countLine}\n`;
	const lines = result.groups.map(
		(group) => `${group.label.padEnd(23)}${String(group.count).padStart(2)}   ${group.names.join(" ")}`,
	);
	return `${countLine}\n\n${lines.join("\n")}\n`;
};
