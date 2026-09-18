import { unconfirmedDelivery } from "./sentences.ts";

export const sendDeadline = async <T>(send: Promise<T>, milliseconds = 15_000) => {
	let timer: ReturnType<typeof setTimeout>;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(unconfirmedDelivery)), milliseconds);
	});
	return Promise.race([send, deadline]).finally(() => clearTimeout(timer));
};
