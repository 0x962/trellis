// The command the button copies: the settings template with every
// `{brief}` replaced by the ticket identifier. Nothing else in the
// template changes.
export const buildAgentCommand = (template: string, identifier: string) => template.replaceAll("{brief}", identifier);
