import { useQuery } from "@tanstack/react-query";
import { HarnessSchema, type StatusAgentConfig } from "@trellis/api";
import { Select } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { LaunchFields } from "../../../../agents/LaunchFields";

export function ColumnAgentFields({
	value,
	onChange,
}: {
	value: StatusAgentConfig | null;
	onChange: (value: StatusAgentConfig | null) => void;
}) {
	const { orpc } = useApp();
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const accounts = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	return (
		<div className="flex min-w-0 flex-col gap-3">
			<Select
				label="Worker persona"
				value={value?.personaId ?? "manual"}
				disabled={personas.isPending}
				items={[
					{ value: "manual", label: "Manual column" },
					...(personas.data ?? [])
						.filter((persona) => persona.kind !== "manager")
						.map((persona) => ({ value: persona.id, label: persona.name })),
				]}
				onValueChange={(personaId) =>
					onChange(
						personaId === "manual"
							? null
							: {
									personaId,
									harness: value?.harness ?? HarnessSchema.parse({ preset: "claude" }),
									accountId: value?.accountId ?? null,
								},
					)
				}
			/>
			{value && (
				<>
					<LaunchFields
						harness={value.harness}
						onChange={(harness) =>
							onChange({
								...value,
								harness,
								accountId: harness.preset === value.harness.preset ? value.accountId : null,
							})
						}
					/>
					<Select
						label="Worker account"
						value={value.accountId ?? "default"}
						items={[
							{ value: "default", label: "Harness default" },
							...(accounts.data ?? [])
								.filter(
									(account) =>
										account.harness === value.harness.preset && (account.enabled || account.id === value.accountId),
								)
								.map((account) => ({ value: account.id, label: account.name })),
						]}
						onValueChange={(accountId) => onChange({ ...value, accountId: accountId === "default" ? null : accountId })}
					/>
					<p className="text-sm text-fg-muted">
						Changes apply at the next start or restart. Existing workers continue.
					</p>
				</>
			)}
			{(personas.error || accounts.error) && (
				<p role="alert" className="text-sm text-danger">
					{(personas.error ?? accounts.error)!.message}
				</p>
			)}
		</div>
	);
}
