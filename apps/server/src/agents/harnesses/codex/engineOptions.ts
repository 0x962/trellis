export function engineOptions(manager: boolean, managerConfig: Record<string, unknown>, effort?: string): string[] {
	const config = manager ? Object.entries(managerConfig).map(([key, value]) => `${key}=${JSON.stringify(value)}`) : [];
	if (effort) config.push(`model_reasoning_effort=${JSON.stringify(effort)}`);
	return ["--disable", "hooks", ...(manager ? ["--strict-config"] : []), ...config.flatMap((value) => ["-c", value])];
}
