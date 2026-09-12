import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expectClasses, expectFocusRing, expectHitArea } from "../../../test/classes";
import { Switch } from "./Switch";

function Controlled({ onCheckedChange }: { onCheckedChange: (checked: boolean) => void }) {
	const [checked, setChecked] = useState(false);
	return (
		<Switch
			label="Sound"
			checked={checked}
			onCheckedChange={(next) => {
				setChecked(next);
				onCheckedChange(next);
			}}
		/>
	);
}

describe("Switch", () => {
	test("switch toggles with Space and Enter, reflects disabled", async () => {
		const user = userEvent.setup();
		const onCheckedChange = mock();
		const onLocked = mock();
		render(
			<>
				<Controlled onCheckedChange={onCheckedChange} />
				<Switch label="Locked" checked={false} disabled onCheckedChange={onLocked} />
			</>,
		);
		const sound = screen.getByRole("switch", { name: "Sound" });
		expectClasses(sound, "h-5 w-9 rounded-round bg-border-strong data-checked:bg-accent duration-hover");
		expectFocusRing(sound);
		expectHitArea(sound, "box16");
		sound.focus();
		await user.keyboard(" ");
		expect(onCheckedChange).toHaveBeenLastCalledWith(true);
		await user.keyboard("{Enter}");
		expect(onCheckedChange).toHaveBeenLastCalledWith(false);
		expect(onCheckedChange).toHaveBeenCalledTimes(2);

		const locked = screen.getByRole("switch", { name: "Locked" });
		expect(locked.getAttribute("aria-disabled")).toBe("true");
		await user.click(locked);
		locked.focus();
		await user.keyboard(" {Enter}");
		expect(onLocked).not.toHaveBeenCalled();
	});
});
