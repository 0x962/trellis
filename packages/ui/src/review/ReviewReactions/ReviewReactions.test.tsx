import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ReviewReactions } from "./ReviewReactions";

test("removal of the final reaction returns focus to the reaction chooser", async () => {
	function Example() {
		const [reactions, setReactions] = useState([{ reaction: "+1", author: "dana", kind: "human" }]);
		return <ReviewReactions reactions={reactions} actor="dana" busy={false} onReaction={() => setReactions([])} />;
	}
	render(<Example />);
	await userEvent.click(screen.getByRole("button", { name: "Agree (1)" }));
	expect(document.activeElement === screen.getByRole("button", { name: "Add reaction" })).toBe(true);
});
