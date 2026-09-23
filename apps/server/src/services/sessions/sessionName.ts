// A generated session name is `<adjective>-<noun>`, in the style of the
// directory names Superset gives its sessions.
const adjectives = [
	"amber",
	"brisk",
	"calm",
	"clever",
	"coral",
	"crisp",
	"eager",
	"fresh",
	"gentle",
	"golden",
	"hazel",
	"jolly",
	"keen",
	"lucky",
	"mellow",
	"misty",
	"noble",
	"olive",
	"quiet",
	"rapid",
	"rosy",
	"silver",
	"sunny",
	"swift",
	"tidy",
	"vivid",
	"warm",
	"witty",
];
const nouns = [
	"anchor",
	"badger",
	"beacon",
	"canyon",
	"cedar",
	"comet",
	"dune",
	"ember",
	"falcon",
	"fjord",
	"garden",
	"harbor",
	"heron",
	"island",
	"juniper",
	"kite",
	"lantern",
	"meadow",
	"otter",
	"pebble",
	"quill",
	"reef",
	"river",
	"sparrow",
	"summit",
	"thistle",
	"valley",
	"willow",
];

const pick = (words: readonly string[], random: () => number) => words[Math.floor(random() * words.length)]!;

export const friendlySessionName = (random: () => number = Math.random) =>
	`${pick(adjectives, random)}-${pick(nouns, random)}`;

// The directory-safe form of a session name: lowercase letters, digits, and
// single dashes, at most 40 characters, with no dash at either end. A name
// written only in punctuation or in another script gives an empty string,
// and the caller then picks a generated name for the directory.
export const sessionSlug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");

// Picks the folder name for a scratch session repository. Two sessions may
// hold one display name, but two folders in `sessions/` cannot, so the
// second one gets `-2`, `-3`, and so on. A suffix never pushes the folder
// name past 40 characters. `taken` holds the folder names that already
// exist, both on disk and in the sessions table.
export const uniqueDirectoryName = (slug: string, taken: ReadonlySet<string>) => {
	if (!taken.has(slug)) return slug;
	for (let count = 2; ; count++) {
		const suffix = `-${count}`;
		const candidate = `${slug.slice(0, 40 - suffix.length).replace(/-+$/g, "")}${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}
};
