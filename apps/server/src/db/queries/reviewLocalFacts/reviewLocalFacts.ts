import type { LocalPrState } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../../tx";
import { localHumanVerdict } from "../pullRequestRows";
import { rows, textArray } from "../support";

type LocalFacts = {
	localState: LocalPrState;
	localVerdict: "approved" | "changes_requested" | null;
};

export const reviewLocalFacts = async (tx: Tx, input: { urls: string[] }) => {
	const found = await rows<LocalFacts & { url: string }>(
		tx,
		sql`
		SELECT p.url, p.local_state AS "localState", ${localHumanVerdict(sql`p.id`)} AS "localVerdict"
		FROM pull_requests p WHERE p.url = ANY(${textArray(input.urls)})
		`,
	);
	return new Map(found.map(({ url, ...facts }) => [url, facts]));
};
