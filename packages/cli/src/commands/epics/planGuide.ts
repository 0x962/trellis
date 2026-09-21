export const planGuideText = (text: string) => {
	const start = text.indexOf("Plan an epic.");
	return text.slice(start, text.indexOf("\n\n", start) + 1);
};
