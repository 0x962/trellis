import type { Evidence } from "@trellis/api";
import { cell, type ListSpec } from "../../output.ts";

const recordText = (row: Evidence, key: string): string => {
	const value = row.record[key];
	return typeof value === "string" ? value : "";
};

const captionOf = (row: Evidence): string => {
	switch (row.kind) {
		case "before":
		case "after":
		case "capture":
			return recordText(row, "route");
		case "clip":
			return recordText(row, "caption");
		case "verify":
		case "equivalence":
			return recordText(row, "command");
		case "test":
			return recordText(row, "name") || recordText(row, "reason");
		case "migration":
			return recordText(row, "table");
		case "picture":
			return recordText(row, "why");
		case "console":
		case "contract":
			return "";
	}
};

export const evidenceList: ListSpec<Evidence> = {
	columns: [
		{ name: "kind", value: (row) => row.kind },
		{ name: "headSha", value: (row) => row.headSha },
		{ name: "file", value: (row) => cell(row.blob?.filename) },
		{ name: "caption", value: (row) => cell(captionOf(row)) },
	],
	identifier: (row) => row.id,
};
