export function canonicalBytes(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalBytes).join(",")}]`;
	if (value !== null && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonicalBytes(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) as string;
}
