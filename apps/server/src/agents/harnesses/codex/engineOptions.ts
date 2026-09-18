export function engineOptions(effort?: string): string[] {
	const config: string[] = [];
	if (effort) config.push(`model_reasoning_effort=${JSON.stringify(effort)}`);
	return ["--disable", "hooks", ...config.flatMap((value) => ["-c", value])];
}
