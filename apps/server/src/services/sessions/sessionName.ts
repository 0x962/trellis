export const temporarySessionName = "New session";

// The folder form of a session name uses lowercase letters, digits, and single dashes.
// The name holds at most 40 characters.
// It starts and ends with a letter or a digit.
// A name with only punctuation or non-Latin letters gives an empty string.
// The caller then uses `new-session` for the directory.
export const sessionSlug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");

// The folder of a session without a project needs a unique name.
// Two sessions can use the same display name.
// Two folders cannot use the same name.
// The second folder adds `-2`, `-3`, and so on.
// A suffix keeps the folder name within 40 characters.
// `taken` holds the folder names from disk and from the sessions table.
export const uniqueDirectoryName = (slug: string, taken: ReadonlySet<string>) => {
	if (!taken.has(slug)) return slug;
	for (let count = 2; ; count++) {
		const suffix = `-${count}`;
		const candidate = `${slug.slice(0, 40 - suffix.length).replace(/-+$/g, "")}${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}
};
