const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encodeReviewImage = (type: string, source: ReadableStream<Uint8Array>) => {
	const reader = source.getReader();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(type));
		},
		async pull(controller) {
			const chunk = await reader.read();
			if (chunk.done) controller.close();
			else controller.enqueue(chunk.value);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
};

export const decodeReviewImage = async (source: ReadableStream<Uint8Array>) => {
	const reader = source.getReader();
	const header = await reader.read();
	return {
		type: decoder.decode(header.value!),
		body: new ReadableStream<Uint8Array>({
			async pull(controller) {
				const chunk = await reader.read();
				if (chunk.done) controller.close();
				else controller.enqueue(chunk.value);
			},
			cancel(reason) {
				return reader.cancel(reason);
			},
		}),
	};
};
