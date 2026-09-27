export const planGuideText = (text: string) => {
	const start = text.indexOf("## Write tickets and plan waves");
	const end = text.indexOf("\n## Talk to other agents", start + 1);
	return `${text.slice(start, end === -1 ? undefined : end).trimEnd()}\n`;
};
