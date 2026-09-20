import type { StatusCategory } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

type ChainRow = {
	direction: "releases" | "waits";
	id: string;
	identifier: string;
	number: number;
	title: string;
	status: StatusCategory;
	is_question: boolean;
	outcome: string;
};

const statusWords = (row: ChainRow) => {
	if (row.status === "started") return "in progress";
	if (row.status === "review") return row.is_question ? "human review" : "agent review";
	return row.status;
};

const sentenceList = (parts: string[]) => {
	if (parts.length === 1) return parts[0] as string;
	return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
};

const listLines = (items: ChainRow[]) =>
	items.length === 0 ? ["  - nothing"] : items.map((item) => `  - ${item.identifier} ${item.title}`);

const dependencyLines = (dependencies: ChainRow[]) => {
	if (dependencies.length === 0) return ["  - nothing"];
	return dependencies.flatMap((dependency) => [
		`  - ${dependency.identifier} ${dependency.title} (${statusWords(dependency)})`,
		...(dependency.status === "done" ? [`    Outcome: ${dependency.outcome || "nothing recorded."}`] : []),
	]);
};

const readyLine = (dependencies: ChainRow[]) => {
	const blockers = dependencies.filter((dependency) => dependency.status !== "done");
	if (blockers.length === 0) return "yes. No ticket holds this one back.";
	return `no. ${sentenceList(
		blockers.map((dependency) =>
			dependency.is_question ? `${dependency.identifier} is open` : `${dependency.identifier} is not merged`,
		),
	)}.`;
};

export const chainLines = async (tx: Tx, ticketId: string): Promise<string[]> => {
	const found = await rows<ChainRow>(
		tx,
		sql`SELECT 'waits' AS direction, dependency.id,
			root.key || '-' || dependency.number AS identifier,
			dependency.number, dependency.title, status.category AS status,
			(status.reviewer = 'human' AND dependency.description ~ '(?ms)^Options:[[:space:]]*[^[:space:]]') AS is_question,
			dependency.outcome
		FROM ticket_deps edge
		JOIN tickets dependency ON dependency.id = edge.depends_on_id
		JOIN statuses status ON status.id = dependency.status_id
		JOIN projects root ON root.id = dependency.root_id
		WHERE edge.ticket_id = ${ticketId}
		UNION ALL
		SELECT 'releases' AS direction, released.id,
			root.key || '-' || released.number AS identifier,
			released.number, released.title, status.category AS status,
			false AS is_question, released.outcome
		FROM ticket_deps edge
		JOIN tickets released ON released.id = edge.ticket_id
		JOIN statuses status ON status.id = released.status_id
		JOIN projects root ON root.id = released.root_id
		WHERE edge.depends_on_id = ${ticketId}
		ORDER BY number, id`,
	);
	const dependencies = found.filter((row) => row.direction === "waits");
	const releases = found.filter((row) => row.direction === "releases");
	const question = dependencies.find((dependency) => dependency.status !== "done" && dependency.is_question);
	return [
		"## Chain",
		"",
		"- Waits on:",
		...dependencyLines(dependencies),
		`- Ready: ${readyLine(dependencies)}`,
		"- Releases:",
		...listLines(releases),
		...(question === undefined ? [] : [`- Applies: ${question.identifier}, open. ${question.title}`]),
	];
};
