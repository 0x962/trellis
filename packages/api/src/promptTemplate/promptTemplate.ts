export const promptVariables = (template: string) =>
	[...template.matchAll(/\{\{([^{}]*)\}\}/g)].map((match) => ({
		name: match[1]!,
		from: match.index,
		to: match.index + match[0].length,
	}));

export const promptTemplateError = (template: string, variables: readonly string[]): string | undefined => {
	if (template.trim().length === 0) return "Enter a startup prompt.";
	const unknown = [
		...new Set(
			promptVariables(template)
				.map(({ name }) => name)
				.filter((name) => !variables.includes(name)),
		),
	];
	if (unknown.length > 0) return `Unknown variables: ${unknown.map((name) => `{{${name}}}`).join(", ")}.`;
	return undefined;
};
