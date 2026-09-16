export const sendDeadline = async <T>(send: Promise<T>, milliseconds = 15_000) => {
	let timer: ReturnType<typeof setTimeout>;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new Error("The manager send result is unknown after the transport timeout. Confirm receipt before a resend."),
				),
			milliseconds,
		);
	});
	return Promise.race([send, deadline]).finally(() => clearTimeout(timer));
};
