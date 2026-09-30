import { UserCircle } from "@phosphor-icons/react";
import { accounts, agents, efforts, type Layout, models } from "../../../model";
import { PickerButton, Popover, ProviderIcon, Select } from "../../../ui";
import type { ComposerState } from "../useComposer";

export function AgentFields({ state, layout }: { state: ComposerState; layout: Layout }) {
	const chosen = state.agent !== "none";
	const controls = (
		<div className="agent-settings">
			<Select
				label="Model"
				hideLabel={false}
				items={models[state.agent]}
				value={state.model}
				onValueChange={state.setModel}
				disabled={state.locked}
			/>
			<Select
				label="Effort"
				hideLabel={false}
				items={efforts}
				value={state.effort}
				onValueChange={state.setEffort}
				disabled={state.locked}
			/>
			<Select
				label="Account"
				hideLabel={false}
				items={accounts}
				value={state.account}
				onValueChange={state.setAccount}
				disabled={state.locked}
			/>
		</div>
	);
	return (
		<section className={`agent-section agent-${layout}`} aria-label="Agent assignment">
			<div className="agent-heading">
				<span className="field-heading">Assign to</span>
				{layout === "split" && <span className="optional-label">Optional</span>}
			</div>
			<Select
				label="Agent"
				items={agents.map((item) => ({
					...item,
					icon:
						item.value === "none" ? (
							<UserCircle className="size-4" />
						) : (
							<ProviderIcon decorative provider={item.value === "codex" ? "openai" : "anthropic"} />
						),
				}))}
				value={state.agent}
				onValueChange={state.chooseAgent}
				disabled={state.locked}
				className="agent-select"
			/>
			{chosen && layout === "compact" && (
				<Popover
					label="Agent settings"
					side="top"
					align="end"
					className="agent-popover"
					trigger={
						<PickerButton label="Model and agent settings" size="sm" disabled={state.locked} className="model-trigger">
							{state.modelLabel}
							<span className="model-effort"> · {state.effort}</span>
						</PickerButton>
					}
				>
					<div className="popover-heading">Agent settings</div>
					{controls}
					<p className="setting-note">These settings apply to this ticket.</p>
				</Popover>
			)}
			{chosen && layout === "split" && controls}
			<p className="assignment-note">
				{chosen ? "Starts when you create this ticket." : "You can assign an agent later."}
			</p>
		</section>
	);
}
