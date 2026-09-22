import { useMutation } from "@tanstack/react-query";
import type { Session } from "@trellis/api";
import { cx, Input, toast } from "@trellis/ui";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type SessionNameFieldProps = {
	session: Session;
	label?: string;
	className?: string;
	inputClassName?: string;
	onCancel: () => void;
	onSaved?: () => void;
};

export function SessionNameField({
	session,
	label = "Session name",
	className,
	inputClassName,
	onCancel,
	onSaved,
}: SessionNameFieldProps) {
	const { client, orpc, queryClient } = useApp();
	const [draft, setDraft] = useState(session.name);
	const [empty, setEmpty] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => setDraft(session.name), [session.name]);
	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);
	const rename = useMutation({
		mutationFn: (name: string) => client.sessions.rename({ id: session.id, name }),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			]);
			onSaved?.();
		},
		onError: (error) => toast.error("The session name did not change.", { description: error.message }),
	});
	const submit = (event: FormEvent) => {
		event.preventDefault();
		const name = draft.trim();
		setEmpty(name === "");
		if (name === "") return;
		rename.mutate(name);
	};
	const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		onCancel();
	};
	return (
		<form className={cx("min-w-0", className)} onSubmit={submit}>
			<Input
				ref={inputRef}
				label={label}
				hideLabel
				value={draft}
				disabled={rename.isPending}
				invalid={empty}
				className={cx("min-w-0", inputClassName)}
				onChange={(event) => {
					setDraft(event.target.value);
					setEmpty(false);
				}}
				onKeyDown={keyDown}
			/>
		</form>
	);
}
