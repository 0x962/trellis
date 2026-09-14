export function boundedText(text: string, limit = 512 * 1024) {
	const bytes = Buffer.from(text);
	return bytes.length <= limit
		? { text, truncated: false }
		: { text: new TextDecoder().decode(bytes.subarray(0, limit), { stream: true }), truncated: true };
}
