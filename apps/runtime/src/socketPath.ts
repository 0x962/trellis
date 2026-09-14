export function validateSocketPath(path: string) {
	if (Buffer.byteLength(path) > 103)
		throw new Error(`Runtime socket path exceeds the macOS 103-byte limit. Select a shorter TRELLIS_HOME: ${path}`);
}
