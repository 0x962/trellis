import { useQuery } from "@tanstack/react-query";
import { Field, Select } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { flowProjectItems } from "../flowProject";

export type FlowProjectSelectProps = {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	hint?: ReactNode;
};

// The project field of the flow editor and of the new flow dialog.
//
// While the project list loads, and after a load that failed, the select
// holds one item, "Every project". A save of that item would move the flow
// to every project, so the select stays disabled until the list arrives, and
// a failed load says so in place of the hint.
export function FlowProjectSelect({ value, onChange, disabled = false, hint }: FlowProjectSelectProps) {
	const { orpc } = useApp();
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const loaded = projects.data ?? [];
	return (
		<Field
			label="Project"
			hint={
				projects.isError ? (
					<span role="alert" className="text-danger">
						Could not load the projects. Reopen this to pick a project.
					</span>
				) : (
					hint
				)
			}
		>
			<Select
				label="Project"
				value={value}
				items={flowProjectItems(loaded)}
				disabled={disabled || loaded.length === 0}
				onValueChange={onChange}
			/>
		</Field>
	);
}
