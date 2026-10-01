import type { TicketClassification, TicketClassificationInput } from "@trellis/api";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";

type Input = {
	project: string | undefined;
	title: string;
	description: string;
	epic: string | undefined;
	wave: string | undefined;
	disabled: boolean;
	onResult: (result: TicketClassification, input: TicketClassificationInput) => void;
};

export function useTicketClassification({ project, title, description, epic, wave, disabled, onResult }: Input) {
	const { client } = useApp();
	const [state, setState] = useState<"idle" | "pending" | "error">("idle");
	const apply = useRef(onResult);
	apply.current = onResult;
	useEffect(() => {
		setState("idle");
		if (disabled || !project || !title.trim()) return;
		const controller = new AbortController();
		const input = { project, title: title.trim(), description, epic, wave };
		const timer = setTimeout(() => {
			setState("pending");
			void client.tickets.classify(input, { signal: controller.signal }).then(
				(result) => {
					if (controller.signal.aborted) return;
					apply.current(result, input);
					setState("idle");
				},
				() => {
					if (!controller.signal.aborted) setState("error");
				},
			);
		}, 600);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [client, project, title, description, epic, wave, disabled]);
	return state;
}
