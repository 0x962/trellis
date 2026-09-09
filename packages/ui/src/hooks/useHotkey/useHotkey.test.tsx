import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useHotkey } from "./useHotkey";

function Probe({ onA, onModK }: { onA: () => void; onModK: () => void }) {
	useHotkey("a", onA);
	useHotkey("mod+k", onModK);
	return <input aria-label="Title" />;
}

describe("useHotkey", () => {
	test("fires on the key, honors mod, ignores editable targets, cleans up", () => {
		const onA = mock();
		const onModK = mock();
		const { unmount } = render(<Probe onA={onA} onModK={onModK} />);

		fireEvent.keyDown(document.body, { key: "a" });
		expect(onA).toHaveBeenCalledTimes(1);
		expect(onModK).not.toHaveBeenCalled();

		fireEvent.keyDown(document.body, { key: "k" });
		expect(onModK).not.toHaveBeenCalled();
		fireEvent.keyDown(document.body, { key: "k", metaKey: true });
		expect(onModK).toHaveBeenCalledTimes(1);

		const input = screen.getByRole("textbox", { name: "Title" });
		input.focus();
		fireEvent.keyDown(input, { key: "a" });
		expect(onA).toHaveBeenCalledTimes(1);

		unmount();
		fireEvent.keyDown(document.body, { key: "a" });
		fireEvent.keyDown(document.body, { key: "k", metaKey: true });
		expect(onA).toHaveBeenCalledTimes(1);
		expect(onModK).toHaveBeenCalledTimes(1);
	});
});
