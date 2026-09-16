import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type { BuiltInHarness } from "@trellis/api";
import { Select } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";

// The empty value stands for no model setting: the harness picks its own.
const DEFAULT_ITEM = { value: "", label: "Harness default" };

// What the harness program or its parser said. Every other failure reads
// as the message of the error.
const errorLine = (error: unknown): string => {
	if (error instanceof ORPCError && error.code === "HARNESS_MODELS_FAILED") {
		return (error.data as { message: string }).message;
	}
	return (error as Error).message;
};

// A picker over the models the harness program lists. The server runs the
// program once for each harness, and the list stays cached for the page.
// A saved model that the list does not hold stays selectable, so a setting
// made by hand or on another machine never disappears from the trigger.
export function ModelSelect({
	harness,
	value,
	onChange,
}: {
	harness: BuiltInHarness;
	value: string | undefined;
	onChange: (model: string | undefined) => void;
}) {
	const { orpc } = useApp();
	const models = useQuery(orpc.system.harnessModels.queryOptions({ input: { harness } }));
	const listed = models.data ?? [];
	const items = [
		DEFAULT_ITEM,
		...(value !== undefined && !listed.some((model) => model.value === value) ? [{ value, label: value }] : []),
		...listed,
	];
	return (
		<div className="manager-settings-field">
			<Select
				label="Model"
				placeholder={models.isPending ? "Loading models" : "Harness default"}
				items={items}
				value={value ?? ""}
				disabled={models.isPending}
				onValueChange={(next) => onChange(next === "" ? undefined : next)}
			/>
			{models.error ? (
				<p role="alert" className="manager-settings-hint text-danger">
					Could not list the models of {harness}: {errorLine(models.error)}
				</p>
			) : (
				<p className="manager-settings-hint">Harness default lets the harness choose its own model.</p>
			)}
		</div>
	);
}
