// The top-level message of the GH_UNAVAILABLE error that a review call throws.
// A toast shows this text alone, and gh writes its standard error for a
// terminal: several lines, and sometimes a usage block. So the sentence names
// what failed and adds the first line of gh's own output.
//
// The whole standard error stays in the `message` field of the gh result, which
// the GitHub row of the settings page shows behind Details.
export const ghUnavailableText = (stderr: string) =>
	`gh could not read the pull request. ${stderr.split("\n")[0]!.trim()}`.trim();
