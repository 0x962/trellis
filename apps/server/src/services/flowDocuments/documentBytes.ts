type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const ordered = (value: JsonValue): JsonValue => {
	if (Array.isArray(value)) return value.map(ordered);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, ordered(value[key]!)]),
		);
	}
	return value;
};

export const documentBytes = (value: unknown): Buffer =>
	Buffer.from(JSON.stringify(ordered(JSON.parse(JSON.stringify(value)) as JsonValue)));
