// `target` and `createTarget` hold shell flags, such as `--host 'abc'`. Each reaches
// the shell as written. Every other value is one argument, and the single
// quotes around it stop the shell from reading it as more than one.
const rawKeys = new Set(["target", "createTarget"]);

export const expandLaunchTemplate = (template: string, values: Record<string, string>) =>
	template.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) =>
		rawKeys.has(key) ? values[key]! : `'${values[key]!.replaceAll("'", "'\\''")}'`,
	);
