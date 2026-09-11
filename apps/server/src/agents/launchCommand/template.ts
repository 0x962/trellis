export const expandLaunchTemplate = (template: string, values: Record<string, string>) =>
	template.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => `'${values[key]!.replaceAll("'", "'\\''")}'`);
