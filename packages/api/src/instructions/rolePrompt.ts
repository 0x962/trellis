import { type BuilderPromptInput, builderPrompt } from "./builder.ts";
import { type ManagerPromptInput, managerPrompt } from "./manager.ts";
import { type ReviewerPromptInput, reviewerPrompt } from "./reviewer.ts";

export type RolePromptInput = ManagerPromptInput | BuilderPromptInput | ReviewerPromptInput;

// The prompt an agent of each role starts with. `trellis instructions
// --role` prints it, and the command from `agentLaunch` passes that output
// to claude, so every agent of a role gets the same text.
export const rolePrompt = (input: RolePromptInput): string => {
	switch (input.role) {
		case "manager":
			return managerPrompt(input);
		case "builder":
			return builderPrompt(input);
		case "reviewer":
			return reviewerPrompt(input);
	}
};
