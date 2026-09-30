export function previewArgument(argv: string[]): string | null | undefined {
	const arguments_ = argv.filter((arg) => arg === "--ui-preview" || arg.startsWith("--ui-preview="));
	if (arguments_.length === 0) return;
	if (arguments_.length !== 1) throw new Error("Supply one --ui-preview address.");
	const value = arguments_[0]!.slice("--ui-preview=".length);
	if (value === "off") return null;
	const url = new URL(value);
	if (
		url.protocol !== "http:" ||
		url.hostname !== "127.0.0.1" ||
		url.port === "" ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	)
		throw new Error("UI preview requires an HTTP address at 127.0.0.1 with a port and no path.");
	return url.origin;
}
