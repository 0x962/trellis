import { UserCircle } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { accounts, efforts, models } from "../../../model";
import { Command, PickerButton, Popover, ProviderIcon, Select } from "../../../ui";
import type { ComposerState } from "../useComposer";

export function AgentFields({ state }: { state: ComposerState }) {
	const [open, setOpen] = useState(false);
	const search = useRef<HTMLInputElement>(null);
	const chosen = state.agent !== "none";
	return (
		<Popover
			label="Assign agent"
			open={open}
			onOpenChange={setOpen}
			initialFocus={search}
			className="assignment-picker"
			trigger={
				<PickerButton label="Assign agent" size="sm" disabled={state.locked} className="property-chip agent-chip">
					<span className="chip-content">
						{chosen ? (
							<ProviderIcon decorative provider={state.agent === "codex" ? "openai" : "anthropic"} />
						) : (
							<UserCircle size={15} />
						)}
						{chosen ? state.agentLabel : "Assign agent"}
						{chosen && <span className="chip-detail">{state.modelLabel}</span>}
					</span>
				</PickerButton>
			}
		>
			<Command
				label="Search agents and models"
				placeholder="Search agents and models…"
				inputRef={search}
				items={[{ id: "none", label: "No agent", icon: <UserCircle />, current: !chosen }]}
				groups={(["codex", "claude"] as const).map((agent) => ({
					heading: agent === "codex" ? "Codex" : "Claude Code",
					items: models[agent].map((model) => ({
						id: `${agent}/${model.value}`,
						label: model.label,
						keywords: [agent],
						icon: <ProviderIcon decorative provider={agent === "codex" ? "openai" : "anthropic"} />,
						current: state.agent === agent && state.model === model.value,
						checked: state.agent === agent && state.model === model.value,
					})),
				}))}
				onSelect={(id) => {
					if (id === "none") state.chooseAgent("none");
					else {
						const [agent, model] = id.split("/") as ["codex" | "claude", string];
						state.chooseAgent(agent);
						state.setModel(model);
					}
					setOpen(false);
				}}
			/>
			{chosen && (
				<div className="assignment-settings">
					<Select
						label="Effort"
						hideLabel={false}
						items={efforts}
						value={state.effort}
						onValueChange={state.setEffort}
					/>
					<Select
						label="Account"
						hideLabel={false}
						items={accounts}
						value={state.account}
						onValueChange={state.setAccount}
					/>
				</div>
			)}
			<p className="assignment-note">
				{chosen ? "The agent starts when you create the ticket." : "Create the ticket now. Assign an agent later."}
			</p>
		</Popover>
	);
}
