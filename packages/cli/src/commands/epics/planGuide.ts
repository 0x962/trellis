export const planGuideText = (text: string) => {
	const start = text.indexOf("## Use sub-agents");
	const end = text.indexOf("\n## ", start + 1);
	return `${text.slice(start, end === -1 ? undefined : end).trimEnd()}\n`;
};
