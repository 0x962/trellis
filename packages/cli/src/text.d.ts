// `import text from "./file.md" with { type: "text" }` gives the file's
// content as a string. Bun resolves the import; this declares its type.
declare module "*.md" {
	const text: string;
	export default text;
}
