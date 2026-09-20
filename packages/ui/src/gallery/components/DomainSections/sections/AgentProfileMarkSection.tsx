import { Avatar } from "../../../../primitives/Avatar";
import { Section } from "../../Section";

export function AgentProfileMarkSection() {
	return (
		<Section name="AgentProfileMark" note="the run is still; the run works: one band of light every 7 s">
			<Avatar
				kind="agent"
				name="Claude agent"
				agentProfile={{ provider: "anthropic", model: "Claude Opus 5", effort: "Max" }}
			/>
			<Avatar
				kind="agent"
				name="Claude agent"
				agentProfile={{ provider: "anthropic", model: "Claude Opus 5", effort: "Max" }}
				state="working-mild"
			/>
			<Avatar
				kind="agent"
				name="Codex agent"
				agentProfile={{ provider: "openai", model: "GPT-6 Astra", effort: "High" }}
				state="working-mild"
			/>
			<Avatar
				kind="agent"
				name="Local agent"
				agentProfile={{ provider: null, model: "Model not recorded" }}
				state="working"
			/>
		</Section>
	);
}
