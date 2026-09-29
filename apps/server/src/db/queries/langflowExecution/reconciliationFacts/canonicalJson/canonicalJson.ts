export function compareUtf8(left: string, right: string): number {
	return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export function canonicalJson(source: string): string {
	const tokens = source.match(
		/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\]:,]/g,
	)!;
	let position = 0;
	function value(): string {
		const token = tokens[position++]!;
		if (token === "{") {
			const fields: { key: string; value: string }[] = [];
			while (tokens[position] !== "}") {
				const key = JSON.parse(tokens[position++]!) as string;
				position++;
				fields.push({ key, value: value() });
				if (tokens[position] === ",") position++;
			}
			position++;
			fields.sort((left, right) => compareUtf8(left.key, right.key));
			return `{${fields.map((field) => `${JSON.stringify(field.key)}:${field.value}`).join(",")}}`;
		}
		if (token === "[") {
			const values: string[] = [];
			while (tokens[position] !== "]") {
				values.push(value());
				if (tokens[position] === ",") position++;
			}
			position++;
			return `[${values.join(",")}]`;
		}
		return token.startsWith('"') ? JSON.stringify(JSON.parse(token)) : token;
	}
	return value();
}
