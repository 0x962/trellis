import { createHash } from "node:crypto";

const canonical = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonical);
	if (value !== null && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entry]) => [key, canonical(entry)]),
		);
	return value;
};
export const version = (value: unknown) =>
	createHash("sha256")
		.update(JSON.stringify(canonical(value)))
		.digest("hex");
