const prose = (body: string) =>
	body.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\1|$)/g, " ").replace(/(`+)[^`]*?\1/g, " ");

export const mentionedNames = (body: string, names: string[]) => {
	if (names.length === 0) return new Set<string>();
	const alternatives = [...names]
		.sort((a, b) => b.length - a.length)
		.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|");
	const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_@\\\\])@(${alternatives})(?![\\p{L}\\p{N}_-])`, "giu");
	return new Set([...prose(body).matchAll(pattern)].map((match) => match[1]!.toLowerCase()));
};
