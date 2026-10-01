import { HARNESS_PRESETS, type Harness, type HarnessAccount } from "@trellis/api";
import { useMemo } from "react";
import { ComposerAgentPicker } from "../../../../agents/ComposerAgentPicker";
import { sessionComposerActions } from "../../../sessionComposerStore";

export function SessionAgentPicker({
	harness,
	accountId,
	accounts,
	disabled,
}: {
	harness: Harness;
	accountId: string;
	accounts: readonly HarnessAccount[] | undefined;
	disabled: boolean;
}) {
	const launchAccounts = useMemo(() => accounts?.filter((account) => account.capabilities.launch), [accounts]);
	return (
		<ComposerAgentPicker
			value={{
				preset: harness.preset,
				model: harness.model ?? null,
				effort: harness.effort ?? null,
				accountId: accountId || null,
			}}
			accounts={launchAccounts}
			disabled={disabled}
			onPick={(preset, model) =>
				sessionComposerActions.selectHarness({
					...(harness.preset === preset ? harness : { preset, ...HARNESS_PRESETS[preset] }),
					model: model ?? undefined,
					effort: undefined,
				})
			}
			onEffort={(effort) => sessionComposerActions.selectHarness({ ...harness, effort: effort ?? undefined })}
			onAccount={(next) => sessionComposerActions.selectAccount(next ?? "")}
		/>
	);
}
