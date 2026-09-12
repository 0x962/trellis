import { Command } from "@trellis/ui";
import type { PaletteRow } from "../../rows";

// The palette rows as Command options. cmdk moves an option in the DOM when
// it ranks the list, so every option stays a direct child of its group.
export const drawRows = (rows: PaletteRow[]) =>
	rows.map((row) => (
		<Command.Row
			key={row.value}
			value={row.value}
			label={row.label}
			labelMono={row.labelMono}
			sub={row.sub}
			mono={row.mono}
			prefix={row.prefix}
			leading={row.leading}
			keys={row.keys}
			icon={row.icon}
			keywords={row.keywords}
			onSelect={row.run}
		/>
	));
