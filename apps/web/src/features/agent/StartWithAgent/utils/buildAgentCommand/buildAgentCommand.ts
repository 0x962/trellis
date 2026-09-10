export type AgentCommandOptions = {
	// An instruction after the brief, such as the names of the failed checks.
	append?: string;
};

// Inside double quotes, the shell still reads these four characters.
const escapeForDoubleQuotes = (text: string) => text.replace(/["$`\\]/g, (char) => `\\${char}`);

// The index of each double quote that the shell reads as a quote, so a
// backslash-escaped quote is not in the list.
const quoteIndexes = (text: string) => {
	const indexes: number[] = [];
	for (let index = 0; index < text.length; index++) {
		if (text[index] === "\\") index++;
		else if (text[index] === '"') indexes.push(index);
	}
	return indexes;
};

// The command that Start with agent copies: the settings template with
// every `{brief}` replaced by the ticket identifier. This is the only
// builder of that command in the app. The shell gives the agent the
// quoted argument that holds the brief as one prompt, so `append` goes
// inside that argument, before its closing quote. A template with no
// quoted brief gets `append` as one new quoted argument at the end.
export const buildAgentCommand = (template: string, identifier: string, options: AgentCommandOptions = {}) => {
	const command = template.replaceAll("{brief}", identifier);
	const append = options.append ?? "";
	if (append === "") return command;
	const text = escapeForDoubleQuotes(append);
	const brief = template.lastIndexOf("{brief}");
	if (brief !== -1) {
		const briefEnd = template.slice(0, brief).replaceAll("{brief}", identifier).length + identifier.length;
		const quotes = quoteIndexes(command);
		const opened = quotes.filter((index) => index < briefEnd).length;
		const closing = quotes.find((index) => index >= briefEnd);
		if (opened % 2 === 1 && closing !== undefined) {
			return `${command.slice(0, closing)} ${text}${command.slice(closing)}`;
		}
	}
	return `${command} "${text}"`;
};
