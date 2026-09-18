import type { LineChangesValue } from "./LineChanges";

export function lineChangesVisible(value: LineChangesValue | null | undefined): value is LineChangesValue {
	return value !== undefined && value !== null && (value.additions !== 0 || value.deletions !== 0);
}
