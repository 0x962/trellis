// `target` holds a whole flag pair, such as `--host 'abc'`, so it reaches
// the shell as written. Every other value is one argument, and the single
// quotes around it stop the shell from reading it as more than one.
const rawKeys = new Set(["target"]);

export const expandLaunchTemplate = (template: string, values: Record<string, string>) =>
	template.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) =>
		rawKeys.has(key) ? values[key]! : `'${values[key]!.replaceAll("'", "'\\''")}'`,
	);
