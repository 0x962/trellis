const mask = (characters: string[], pattern: RegExp, keepTerminal = false) => {
	for (const match of characters.join("").matchAll(pattern)) {
		const start = match.index;
		const end = start + match[0].length;
		const terminal = keepTerminal && ".!?".includes(match[0].at(-2) ?? "") ? end - 2 : undefined;
		for (let index = start; index < end; index += 1) {
			if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
		}
		if (terminal !== undefined) characters[terminal] = match[0].at(-2)!;
	}
};

const quotedPatterns = [
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
	const characters = [...text];
	for (const pattern of quotedPatterns) mask(characters, pattern, true);
	mask(characters, namedLine);
	mask(characters, path);
	return characters.join("");
}
