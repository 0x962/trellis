export const ghUnavailableText = (stderr: string) =>
	stderr
		.split("\n")[0]!
		.trim()
		.replace(/^failed to [^:]+:\s*/i, "")
		.replace(/^GraphQL:\s*/i, "");
