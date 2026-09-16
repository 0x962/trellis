const fenceLine = String.raw`^(?:[ \t]*(?:>|[-*+]|\d+[.)]))*[ \t]{0,3}`;
const fences = new RegExp(
	`${fenceLine}\`\`\`[\\s\\S]*?(?:${fenceLine}\`\`\`|(?![\\s\\S]))|${fenceLine}~~~[\\s\\S]*?(?:${fenceLine}~~~|(?![\\s\\S]))`,
	"gm",
);
const codeSpans = /`+[^`\n]*`+/g;
const urls = /[a-z][a-z0-9+.-]*:\/\/\S+|(?:^|\s)\S*\/\S*@\S*/gi;

const withoutIndentedCode = (body: string) => {
	let code = false;
	let blank = true;
	return body
		.split(/\r?\n/)
		.map((line) => {
			code = /^( {4}|\t)/.test(line) && (code || blank);
			blank = line.trim() === "";
			return code ? "" : line;
		})
		.join("\n");
};

const prose = (body: string) =>
	withoutIndentedCode(body.replace(fences, " ")).replace(codeSpans, " ").replace(urls, " ");

export const mentionedNames = (body: string, names: string[]) => {
	if (names.length === 0) return new Set<string>();
	const alternatives = [...names]
		.sort((a, b) => b.length - a.length)
		.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|");
	const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_@\\\\])@(${alternatives})(?![\\p{L}\\p{N}_-])`, "giu");
	return new Set([...prose(body).matchAll(pattern)].map((match) => match[1]!.toLowerCase()));
};
