export function reviewRef(input: string) {
	const value = decodeURIComponent(input.trim()).replace(/\/$/, "");
	const embedded =
		/^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)?(?:https?:\/\/)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(
			value,
		);
	const native =
		/^(?:https?:\/\/(?:trellis\.localhost|localhost|127\.0\.0\.1)(?::\d+)?)?\/reviews\/([\w.-]+)\/([\w.-]+)\/(\d+)(?:[?#].*)?$/.exec(
			value,
		);
	const match = native ?? embedded ?? /^([\w.-]+)\/([\w.-]+)[#/](\d+)$/.exec(value);
	if (!match || [match[1], match[2]].some((part) => part === "." || part === ".."))
		throw new Error("Use a GitHub PR URL or owner/repo#123.");
	const owner = match[1]!.toLowerCase();
	const repo = match[2]!.toLowerCase();
	const number = Number(match[3]);
	if (!Number.isSafeInteger(number) || number < 1) throw new Error("The PR number must be a positive integer.");
	return { owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
}

export function reviewHref(input: string) {
	const ref = reviewRef(input);
	return `/reviews/${ref.owner}/${ref.repo}/${ref.number}`;
}
