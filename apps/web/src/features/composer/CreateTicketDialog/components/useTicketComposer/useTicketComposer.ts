import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { DEFAULT_CHOICE, staleReasonOf } from "../../../../agents/AssignAgent/assignChoice";
import { rememberChoice, useRecentChoices } from "../../../../agents/AssignAgent/recentChoices";
import { useUploads } from "../../../../attachments/hooks/useUploads";
import { useLabels } from "../../../../pickers/hooks/useLabels";
import { toggleLabel } from "../../../../pickers/utils/toggleLabel";
import type { ComposerInstance } from "../../../composerScope";
import { composerActions, useComposerStore } from "../../../composerStore";
import { defaultStatus, useComposerDefaults } from "../../../hooks/useComposerDefaults";
import { useComposerDraft } from "../../../hooks/useComposerDraft";
import { useComposerSubmission } from "../../../hooks/useComposerSubmission";
import { useCreatePlacement } from "../../../hooks/useCreatePlacement";
import { useCreateTicket } from "../../../hooks/useCreateTicket";
import { useClassifiedDraft } from "../../hooks/useClassifiedDraft";

export function useTicketComposer(instance?: ComposerInstance) {
	const { client, orpc, queryClient } = useApp();
	const sharedOptions = useComposerStore((state) => state.options);
	const options = instance?.options ?? sharedOptions;
	const sharedAssignAgent = useComposerStore((state) => state.assignAgent);
	const [ownAssignAgent, setOwnAssignAgent] = useState(sharedAssignAgent);
	const assignAgent = instance ? ownAssignAgent : sharedAssignAgent;
	const sharedCreateMore = useComposerStore((state) => state.createMore);
	const createMore = instance ? false : sharedCreateMore;
	const { draft, setDraft, clearDraft } = useComposerDraft(
		instance ? `${instance.storagePrefix}-draft` : undefined,
		instance ? { title: instance.initialTitle, description: "", project: instance.options.project } : undefined,
	);
	const defaults = useComposerDefaults(options, draft.project);
	const recent = useRecentChoices((state) => state.recent);
	const accounts = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	const project = draft.project ?? defaults.project;
	const status =
		defaults.statuses.find((entry) => entry.slug === (draft.status ?? defaults.status)) ??
		defaultStatus(defaults.statuses);
	const priority = draft.priority ?? options.priority ?? defaults.priority;
	const parent = draft.parent === undefined ? defaults.parent : draft.parent;
	const epic = draft.epic === undefined ? defaults.epic : (draft.epic ?? undefined);
	const wave = draft.wave === undefined ? defaults.wave : (draft.wave ?? undefined);
	const placement = useCreatePlacement(project, epic, wave);
	const defaultAssignment = recent[0] ?? DEFAULT_CHOICE;
	const choice = draft.assignment === undefined ? defaultAssignment : draft.assignment;
	const labels = draft.labels ?? [];
	const { groups } = useLabels(project);
	const description = draft.editing || draft.description !== "" ? draft.description : defaults.template;
	const uploads = useUploads(undefined, false, instance?.storagePrefix);
	const submission = useComposerSubmission(
		{
			create: useCreateTicket(),
			upload: uploads.uploadPending,
			assign: client.agentRuns.start,
			onAssigned: (_run, selected) => {
				if (!instance) rememberChoice(selected);
				void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
				void queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
			},
		},
		instance ? `${instance.storagePrefix}-submission` : undefined,
	);
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const finishing = useRef(false);
	const [completing, setCompleting] = useState(false);
	const [asking, setAsking] = useState(false);
	const [validation, setValidation] = useState<string | null>(null);
	const [editorKey, setEditorKey] = useState(0);
	const titleRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (editorKey > 0) titleRef.current?.focus();
	}, [editorKey]);
	const titleId = useId();
	const errorId = useId();
	const locked = submission.busy || completing || submission.receipt !== null;
	const classification = useClassifiedDraft({
		draft,
		setDraft,
		options,
		project,
		description,
		template: defaults.template,
		defaultPriority: defaults.priority,
		disabled: locked || asking,
		isSubmitting: submission.isRunning,
	});
	const choiceError = choice === null ? null : staleReasonOf(choice, accounts.data);
	const completedStatus = status?.category === "done" || status?.category === "canceled";
	const assignmentError =
		!assignAgent || choice === null
			? null
			: completedStatus
				? "Select an active status or turn off Assign agent."
				: choiceError;
	const titleMissing = validation !== null && !draft.title.trim();
	const retained = {
		...draft,
		project,
		status: status?.slug,
		priority,
		parent,
		epic: epic ?? null,
		wave: wave ?? null,
		labels,
		assignment: choice,
	};
	function close() {
		if (submission.isRunning() || finishing.current) return;
		setDraft(retained);
		if (instance) instance.onClose();
		else composerActions.close();
	}
	async function finish(stay: boolean, discard = false) {
		if (!active.current || finishing.current) return;
		const receipt = submission.getReceipt();
		finishing.current = true;
		setCompleting(true);
		try {
			if (instance && receipt && !discard && !(await instance.onCreated(receipt.identifier))) return;
			submission.clear();
			uploads.clear();
			clearDraft();
			setValidation(null);
			setEditorKey((key) => key + 1);
			if (stay && !instance) setDraft({ ...retained, title: "", description: "", editing: false });
			else if (instance) instance.onClose(true);
			else composerActions.close();
		} catch (error) {
			setValidation((error as Error).message);
		} finally {
			finishing.current = false;
			setCompleting(false);
		}
	}

	async function create(stay = createMore) {
		if (submission.isRunning() || finishing.current || asking) return;
		if (submission.receipt === null) {
			if (!draft.title.trim()) {
				setValidation("Add a ticket title.");
				titleRef.current?.focus();
				return;
			}
			if (!project) {
				setValidation("Choose a project.");
				return;
			}
			if (!placement.ready || assignmentError) return;
		}
		setValidation(null);
		setDraft(retained);
		if (
			await submission.submit(
				{
					project: project!,
					title: draft.title.trim(),
					description,
					status: status?.slug,
					priority,
					...(parent ? { parent } : {}),
					...(placement.epic ? { epic: placement.epic } : {}),
					...(placement.wave ? { wave: placement.wave } : {}),
					...(labels.length ? { labels: labels.map((label) => label.id) } : {}),
				},
				assignAgent ? choice : null,
			)
		)
			await finish(stay);
	}
	const retryLabel =
		uploads.missingFiles.length > 0 || uploads.uploads.some((upload) => upload.status !== "complete")
			? "Retry attachments"
			: "Retry assignment";
	const action = submission.busy
		? { creating: "Creating…", uploading: "Uploading…", assigning: "Assigning…", idle: "" }[submission.phase]
		: submission.receipt
			? retryLabel
			: !assignAgent || choice === null
				? "Create"
				: "Create and assign";
	return {
		assignAgent,
		createMore,
		onAssignAgent: instance ? setOwnAssignAgent : composerActions.setAssignAgent,
		onCreateMore: composerActions.setCreateMore,
		draft,
		setDraft,
		defaults,
		accounts,
		project,
		status,
		priority,
		parent,
		placement: { ...placement, message: classification.message ?? placement.message },
		chooseClassification: classification.choose,
		choice,
		labels,
		description,
		uploads,
		submission,
		asking,
		setAsking,
		validation,
		editorKey,
		titleRef,
		titleId,
		errorId,
		locked,
		attachmentsLocked: submission.busy || completing || (locked && uploads.missingFiles.length === 0),
		assignmentError,
		titleMissing,
		close,
		finish,
		create,
		action,
		onLabel: (label: Parameters<typeof toggleLabel>[1], checked: boolean) =>
			setDraft({ ...draft, labels: toggleLabel(labels, label, groups, checked) }),
	};
}
