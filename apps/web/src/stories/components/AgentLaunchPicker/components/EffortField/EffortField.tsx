import { Select } from "@trellis/ui";
import { useState } from "react";

export function EffortField() {
	const [value, setValue] = useState("high");
	return (
		<Select
			label="Effort"
			hideLabel={false}
			items={[
				{ value: "high", label: "High" },
				{ value: "medium", label: "Medium" },
			]}
			value={value}
			onValueChange={setValue}
		/>
	);
}
