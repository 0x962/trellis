import type { Turn } from "@trellis/api";

export const readyGroupOrder = [
	{ turn: "waits on a merge", label: "waits on a merge" },
	{ turn: "waits on your answer", label: "waits on your answer" },
	{ turn: "you", label: "your turn" },
	{ turn: "agent", label: "with an agent" },
	{ turn: "github", label: "with GitHub" },
] as const satisfies readonly { turn: Turn; label: string }[];

type ReadyGroup = {
	turn: (typeof readyGroupOrder)[number]["turn"];
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
