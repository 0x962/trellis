import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { layout } from "../../theme/layout";
import { Segmented } from "./Segmented";

const options = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
] as const;

describe("Segmented", () => {
	// A finger needs 44 px. The control sits on the Settings tab as the theme
	// picker, so every option is a 44 px target.
	test("every option keeps the 44 px hit area and reports the chosen one", async () => {
		const onChange = jest.fn();
		await render(<Segmented options={options} value="dark" onChange={onChange} />);

		const radios = screen.getAllByRole("radio");
		expect(radios).toHaveLength(3);
		for (const radio of radios) expect(radio).toHaveStyle({ minHeight: layout.hit });

		expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
		await fireEvent.press(screen.getByRole("radio", { name: "Light" }));
		expect(onChange).toHaveBeenCalledWith("light");
	});
});
