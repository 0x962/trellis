export function editorOrigin(value: string, parentOrigin: string) {
	const origin = new URL(value);
	if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== value || origin.origin === parentOrigin) {
		throw new Error("The editor needs a separate HTTP origin.");
	}
	return origin.origin;
}
