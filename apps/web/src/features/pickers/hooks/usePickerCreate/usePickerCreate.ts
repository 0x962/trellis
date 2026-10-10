import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { errorMessage } from "../../../../lib/conflict";

export function usePickerCreate<T>({
	create,
	invalidate,
	onCreated,
	scope,
}: {
	create: (name: string) => Promise<T>;
	invalidate: () => Promise<unknown>;
	onCreated: (item: T) => void;
	scope?: string;
}) {
	const active = useRef(false);
	const generation = useRef(0);
	const previousScope = useRef(scope);
	if (previousScope.current !== scope) {
		previousScope.current = scope;
		generation.current++;
	}
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	const mutation = useMutation({
		mutationFn: (input: { name: string; generation: number }) => create(input.name),
		onSuccess: async (item, input) => {
			await invalidate();
			if (input.generation === generation.current) onCreated(item);
		},
		onSettled: () => {
			active.current = false;
		},
	});
	return {
		create: (name: string) => {
			if (active.current) return;
			active.current = true;
			mutation.mutate({ name, generation: generation.current });
		},
		pending: mutation.isPending,
		error:
			mutation.variables?.generation !== generation.current || mutation.error === null
				? null
				: errorMessage(mutation.error),
		reset: () => {
			generation.current++;
			if (!active.current) mutation.reset();
		},
	};
}
