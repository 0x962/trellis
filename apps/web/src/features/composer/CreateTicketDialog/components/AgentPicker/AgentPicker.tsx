import { type AssignAccounts, type AssignChoice, withoutLostValues } from "../../../../agents/AssignAgent/assignChoice";
import { ComposerAgentPicker } from "../../../../agents/ComposerAgentPicker";

export function AgentPicker({
	value,
	accounts,
	onChange,
	disabled,
}: {
	value: AssignChoice | null;
	accounts: AssignAccounts;
	onChange: (choice: AssignChoice | null) => void;
	disabled: boolean;
}) {
	return (
		<ComposerAgentPicker
			value={value}
			accounts={accounts}
			disabled={disabled}
			onClear={() => onChange(null)}
			onPick={(preset, model) =>
				onChange(
					withoutLostValues(
						{
							preset,
							model,
							effort: value?.preset === preset ? value.effort : null,
							accountId: value?.preset === preset ? value.accountId : null,
						},
						accounts,
					),
				)
			}
			onEffort={(effort) => onChange({ ...value!, effort })}
			onAccount={(accountId) => onChange({ ...value!, accountId })}
			description={
				value ? "The agent starts when you create the ticket." : "Create the ticket now. Assign an agent later."
			}
		/>
	);
}
