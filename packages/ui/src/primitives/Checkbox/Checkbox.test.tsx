import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses, expectFocusRing, expectHitArea } from "../../../test/classes";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
	test("checkbox toggles with Space, supports mixed and disabled", async () => {
		const user = userEvent.setup();
		const onCheckedChange = mock();
		const onLocked = mock();
		render(
			<>
				<Checkbox label="Done" checked={false} onCheckedChange={onCheckedChange} />
				<Checkbox label="Some" checked={false} indeterminate onCheckedChange={() => {}} />
				<Checkbox label="Locked" checked={false} disabled onCheckedChange={onLocked} />
			</>,
		);
		const done = screen.getByRole("checkbox", { name: "Done" });
		expect(done.getAttribute("aria-checked")).toBe("false");
		expectClasses(done, "size-4 rounded-sm border-border-strong data-checked:bg-accent");
		expectFocusRing(done);
		// The box has a 1 px border, so the layer reaches 7 px past the padding box.
		expectHitArea(done, "box16Bordered");
		done.focus();
		await user.keyboard(" ");
		expect(onCheckedChange).toHaveBeenCalledTimes(1);
		expect(onCheckedChange.mock.calls[0]![0]).toBe(true);

		expect(screen.getByRole("checkbox", { name: "Some" }).getAttribute("aria-checked")).toBe("mixed");

		const locked = screen.getByRole("checkbox", { name: "Locked" });
		expect(locked.getAttribute("aria-disabled")).toBe("true");
		await user.click(locked);
		locked.focus();
		await user.keyboard(" ");
		expect(onLocked).not.toHaveBeenCalled();
	});
});
