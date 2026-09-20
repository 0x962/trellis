import type { Evidence } from "@trellis/api";
import { cell, type ListSpec, renderTable } from "../../output.ts";

const textField = (row: Evidence, name: string): string => {
	const value = row.record[name];
	return typeof value === "string" ? value : "";
};

const captionOf = (row: Evidence): string => {
	switch (row.kind) {
		case "before":
		case "after":
		case "capture":
			return textField(row, "route");
		case "clip":
			return textField(row, "caption");
		case "verify":
		case "equivalence":
			return textField(row, "command");
		case "test":
			return textField(row, "name") || textField(row, "reason");
		case "migration":
			return textField(row, "table");
		case "picture":
			return textField(row, "why");
		case "console":
		case "contract":
			return "";
	}
};

export const evidenceList: ListSpec<Evidence> = {
	columns: [
		{ name: "kind", value: (row) => row.kind },
		{ name: "head sha", value: (row) => row.headSha },
		{ name: "file", value: (row) => cell(row.blob?.filename) },
		{ name: "caption", value: (row) => cell(captionOf(row)) },
	],
	identifier: (row) => row.id,
};

export const evidenceText = (rows: Evidence[]): string => renderTable(rows, evidenceList.columns);
