// The address of the diff of one pull request. `{url}` in the template
// stands for the whole pull request URL, so a template puts the URL after
// its own origin verbatim and the URL keeps its own scheme and slashes.
export const diffUrl = (template: string, url: string): string => template.replaceAll("{url}", url);
