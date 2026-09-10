import { Segmented } from "@trellis/ui";

export type ListView = "table" | "board";

export type ViewSwitchProps = {
	value: ListView;
	onChange: (view: ListView) => void;
};

const options = [
	{ value: "table", label: "Table" },
	{ value: "board", label: "Board" },
] as const;

// Table | Board. The view is part of the URL, so the switch navigates.
export function ViewSwitch({ value, onChange }: ViewSwitchProps) {
	return <Segmented label="View" options={options} value={value} onValueChange={onChange} />;
}
