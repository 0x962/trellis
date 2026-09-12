export const gatewayHost = (platform: string, port: number) =>
	platform === "darwin" && port < 1024 ? "0.0.0.0" : "127.0.0.1";

export const isLocalAddress = (address: string | undefined) =>
	address === "::1" || /^127\./.test(address ?? "") || /^::ffff:127\./.test(address ?? "");
