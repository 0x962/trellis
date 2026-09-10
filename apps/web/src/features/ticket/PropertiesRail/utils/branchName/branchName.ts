// Words that carry no meaning in a branch name.
const stopWords: ReadonlySet<string> = new Set([
	"the",
	"a",
	"an",
	"is",
	"are",
	"of",
	"in",
	"on",
	"at",
	"to",
	"for",
	"and",
	"or",
	"with",
	"by",
	"from",
	"after",
	"before",
]);

// The first three meaningful words of a title, lower-case and dashed, with
// punctuation dropped. A title of stop words alone keeps its first word.
export const titleSlug = (title: string) => {
	const words = title
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== "");
	const meaningful = words.filter((word) => !stopWords.has(word));
	return (meaningful.length === 0 ? words : meaningful).slice(0, 3).join("-");
};

// `cde-42-restore-fork-pages`: the identifier in lower case, a dash, and
// the slug. The slug comes from the title at creation and never changes.
export const branchName = (identifier: string, slug: string) => `${identifier.toLowerCase()}-${slug.toLowerCase()}`;
