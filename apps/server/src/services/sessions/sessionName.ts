export const temporarySessionName = "New session";

// The directory-safe form of a session name: lowercase letters, digits, and
// single dashes, at most 40 characters, with no dash at either end. A name
// written only in punctuation or in another script gives an empty string,
// and the caller then uses `new-session` for the directory.
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
