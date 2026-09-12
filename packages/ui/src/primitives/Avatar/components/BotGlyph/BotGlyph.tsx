import { Robot } from "@phosphor-icons/react";

// The agent mark: the Phosphor robot in the bold weight, so it holds its
// shape at 11 px. It is decorative; the Avatar that holds it carries the name.
export function BotGlyph() {
	return <Robot data-glyph="bot" aria-hidden="true" weight="bold" className="size-2.75" />;
}
