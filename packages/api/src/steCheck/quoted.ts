const mask = (characters: string[], pattern: RegExp, keepTerminal = false) => {
	for (const match of characters.join("").matchAll(pattern)) {
		const start = match.index;
		const end = start + match[0].length;
		const terminal = keepTerminal ? /[.!?](?=[`'"”’]?$)/u.exec(match[0]) : null;
		for (let index = start; index < end; index += 1) {
			if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
		}
		if (terminal !== null) characters[start + terminal.index] = terminal[0];
	}
};

// A fenced block, such as a mermaid diagram, and a Markdown image hold no
// sentence, so the check skips them. The fence goes first: the inline code
// pattern would otherwise pair its backticks.
const quotedPatterns = [
	/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm,
	/!\[[^\]\n]*\]\([^)\n]*\)/g,
	/`[^`\n]*`/g,
	/"[^"\n]*"/g,
	/“[^”\n]*”/g,
	/(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu,
	/‘[^’\n]*’/g,
];
const namedLine =
	/^[ \t]*(?:\p{L}*error|fatal|failed|failure|exception|traceback|log|check(?: name)?|test(?: name)?):.*$/gimu;
const path =
	/(?:\b(?:\.{1,2}\/)?(?:[\w@.-]+\/)+[\w@.-]+|\b[\w@-]+\.(?:[cm]?[jt]sx?|vue|py|rb|go|rs|java|kt|swift|css|scss|html|md|json|ya?ml|toml|sql)\b)/g;

export function unquotedText(text: string): string {
	const characters = text.split("");
	for (const pattern of quotedPatterns) mask(characters, pattern, true);
	mask(characters, namedLine);
	mask(characters, path, true);
	return characters.join("");
}
