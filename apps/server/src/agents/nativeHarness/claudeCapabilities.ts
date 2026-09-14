export const claudeCapabilities = {
	adapter: "claude-stream-json",
	certifiedVersion: "2.1.270",
	initialization: "control-response",
	messageAcknowledgement: "replayed-user-uuid",
	turnCompletion: "result",
	permissions: "explicit-control-response",
	trustedDirectoryRequired: true,
} as const;
