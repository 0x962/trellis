import { useRef, useState } from "react";
import {
	type Agent,
	type Attachment,
	type CreatedTicket,
	exampleDescription,
	exampleTitle,
	models,
	type Phase,
	type Scenario,
} from "../../../model";

export function useComposer(scenario: Scenario, onCreated: (ticket: CreatedTicket) => void) {
	const [title, setTitle] = useState(scenario === "empty" ? "" : exampleTitle);
	const [description, setDescription] = useState(scenario === "empty" ? "" : exampleDescription);
	const [status, setStatus] = useState("todo");
	const [priority, setPriority] = useState("none");
	const [label, setLabel] = useState("none");
	const [parent, setParent] = useState("none");
	const [wave, setWave] = useState("tabs");
	const [agent, setAgent] = useState<Agent>("codex");
	const [model, setModel] = useState("sol");
	const [effort, setEffort] = useState("high");
	const [account, setAccount] = useState("default");
	const [keepOpen, setKeepOpen] = useState(false);
	const [files, setFiles] = useState<Attachment[]>([]);
	const [phase, setPhase] = useState<Phase>("editing");
	const [titleError, setTitleError] = useState(false);
	const [receipt, setReceipt] = useState("");
	const titleRef = useRef<HTMLTextAreaElement>(null);
	const submitting = useRef(false);
	const locked = phase !== "editing";
	const processing = phase === "creating" || phase === "assigning";
	const modelLabel = models[agent].find((item) => item.value === model)?.label ?? "";
	const agentLabel = agent === "codex" ? "Codex" : "Claude Code";

	function chooseAgent(value: Agent) {
		setAgent(value);
		setModel(value === "claude" ? "opus" : "sol");
	}

	function clearDraft() {
		setTitle("");
		setDescription("");
		setFiles([]);
		setTitleError(false);
		setReceipt("");
		setPhase("editing");
	}

	function finish(assigned: boolean) {
		onCreated({ id: crypto.randomUUID(), title: title.trim(), assigned, agent: agentLabel, model: modelLabel });
		clearDraft();
		setReceipt(assigned ? `Ticket created and assigned to ${agentLabel}.` : "Ticket created without an agent.");
		titleRef.current?.focus();
	}

	async function submit() {
		if (submitting.current) return;
		if (!title.trim()) {
			setTitleError(true);
			titleRef.current?.focus();
			return;
		}
		submitting.current = true;
		const retry = phase === "failed";
		setPhase(retry ? "assigning" : "creating");
		await new Promise((resolve) => window.setTimeout(resolve, 550));
		if (agent !== "none") {
			setPhase("assigning");
			await new Promise((resolve) => window.setTimeout(resolve, 550));
			if (scenario === "failure" && !retry) {
				setPhase("failed");
				submitting.current = false;
				return;
			}
		}
		finish(agent !== "none");
		submitting.current = false;
	}

	return {
		title,
		setTitle: (value: string) => {
			setTitle(value);
			setReceipt("");
		},
		description,
		setDescription: (value: string) => {
			setDescription(value);
			setReceipt("");
		},
		status,
		setStatus,
		priority,
		setPriority,
		label,
		setLabel,
		parent,
		setParent,
		wave,
		setWave,
		agent,
		chooseAgent,
		model,
		setModel,
		effort,
		setEffort,
		account,
		setAccount,
		keepOpen,
		setKeepOpen,
		files,
		setFiles,
		phase,
		locked,
		processing,
		titleError,
		setTitleError,
		titleRef,
		modelLabel,
		agentLabel,
		receipt,
		clearDraft,
		submit,
		finish,
	};
}

export type ComposerState = ReturnType<typeof useComposer>;
