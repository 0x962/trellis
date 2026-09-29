import type { TrellisClient } from "@trellis/api";
import { Button, FailureState } from "@trellis/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { LangflowWorkspace } from "../../../LangflowWorkspace";
import { type CurrentEditorIdentity, loadEditorMount } from "../loadEditorMount";

type Props = {
	client: TrellisClient;
	flow: string;
	currentIdentity: () => CurrentEditorIdentity;
	connected: boolean;
};
type Mount = Awaited<ReturnType<typeof loadEditorMount>> & { tab: string; storage: Storage };

export function EditorMount({ client, flow, currentIdentity, connected }: Props) {
	const [mount, setMount] = useState<Mount | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const generation = useRef(0);
	const mounted = useRef(false);
	const latest = useRef({ client, flow, currentIdentity });
	latest.current = { client, flow, currentIdentity };
	const open = useCallback(async (tab?: string) => {
		const request = ++generation.current;
		setPending(true);
		setError(null);
		try {
			const tabId = tab ?? sessionStorage.getItem("trellis.flow-tab") ?? crypto.randomUUID();
			const storage = localStorage;
			const active = latest.current;
			const next = await loadEditorMount(active.client.flowDocumentsV1, active.flow, () =>
				latest.current.currentIdentity(),
			);
			if (request !== generation.current) return;
			sessionStorage.setItem("trellis.flow-tab", tabId);
			mounted.current = true;
			setMount({ ...next, tab: tabId, storage });
		} catch (cause) {
			if (request === generation.current) setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (request === generation.current) setPending(false);
		}
	}, []);
	useEffect(
		() => () => {
			generation.current += 1;
		},
		[],
	);
	useEffect(() => {
		if (!connected) {
			generation.current += 1;
			setPending(false);
			return;
		}
		if (!mounted.current) void open();
	}, [connected, open]);
	if (mount === null) {
		return error === null ? (
			<p role="status" className="page-card p-6 text-sm text-fg-muted">
				Open the editor session.
			</p>
		) : (
			<FailureState
				variant="page"
				className="page-card"
				title="The editor is unavailable"
				detail={error}
				description="Your saved flow and browser drafts remain available."
				action={
					<Button onClick={() => void open()} disabled={pending || !connected}>
						Retry
					</Button>
				}
			/>
		);
	}
	return (
		<>
			{error !== null && <FailureState title="The editor could not reopen" detail={error} />}
			<LangflowWorkspace
				{...mount}
				readOnly={false}
				grantActive={connected && !pending}
				currentIdentity={currentIdentity}
				onOpenDraft={open}
			/>
		</>
	);
}
