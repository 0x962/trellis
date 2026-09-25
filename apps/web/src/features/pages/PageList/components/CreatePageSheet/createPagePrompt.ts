export const createPagePrompt = (projectKey: string, request: string) =>
	`Create a Page for project ${projectKey}.\n\n${request.trim()}\n\nCreate the HTML source in your workspace. Publish it with \`trellis page publish\`, then return the Page reference.`;
