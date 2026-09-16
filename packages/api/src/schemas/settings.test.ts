import { expect, test } from "bun:test";
import { SettingsSetInputSchema } from "./settings.ts";

// A person types the default name on the settings page, so the bound reads as
// a sentence and never as zod's own wording.
test("a default actor name over the bound reads as a sentence", () => {
	const result = SettingsSetInputSchema.safeParse({ defaultActorName: "n".repeat(65) });
	expect(result.error!.issues[0]!.message).toBe("Enter a default name of 64 characters or less.");
});
