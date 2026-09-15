// A mention names a persona by the slug of its name, so the persona
// "Feature Builder" answers to @feature-builder. The character before the @
// must be none of a word character, another @, a slash, or a colon, so
// "navid@example.com" and "docs/@feature-builder" hold no mention. After the
// slug, a slash keeps out the package name "@trellis/api", and a dot in front
// of a letter or a digit keeps out the domain "@example.com". A dot that ends
// a sentence still leaves a mention.
const mentionPattern = /(?<![\w@/:])@([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w/-]|\.[a-z0-9])/g;

// A fenced block holds no mention, and a fence with no closing line holds
// code to the end of the body, as Markdown renders it. A person who pastes a
// log reaches for a fence first, and often leaves it open. Markdown opens and
// closes a fence only at the start of a line, after at most three spaces, so
// "wrap logs in ``` please" opens no fence. Quote markers and list markers
// can come before a fence, so a person who quotes a comment with a code block
// quotes no mention from inside that block.
const fenceLine = String.raw`^(?:[ \t]*(?:>|[-*+]|\d+[.)]))*[ \t]{0,3}`;
const fences = new RegExp(
	`${fenceLine}\`\`\`[\\s\\S]*?(?:${fenceLine}\`\`\`|(?![\\s\\S]))|${fenceLine}~~~[\\s\\S]*?(?:${fenceLine}~~~|(?![\\s\\S]))`,
	"gm",
);

// An inline code span holds no mention either. A quoted line still holds a
// mention: a person who quotes a comment to answer it means it.
const codeSpans = /`+[^`\n]*`+/g;

// A URL holds no mention, so "https://medium.com/@feature-builder" starts no
// agent.
const urls = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;

// Markdown reads a line that starts with four spaces or a tab as code when
// it follows a blank line or another code line. A line that continues a
// paragraph stays text.
const withoutIndentedCode = (body: string) => {
	let code = false;
	let blank = true;
	return body
		.split("\n")
		.map((line) => {
			code = /^( {4}|\t)/.test(line) && (code || blank);
			blank = line.trim() === "";
			return code ? "" : line;
		})
		.join("\n");
};

// The persona slugs a comment body mentions, each once, in the order of
// their first mention.
export const mentionSlugs = (body: string): string[] => {
	const text = withoutIndentedCode(body.replace(fences, " ")).replace(codeSpans, " ").replace(urls, " ");
	return [...new Set([...text.matchAll(mentionPattern)].map((match) => match[1] as string))];
};
