export const secureStorageIsAvailable = (platform: string, encryptionAvailable: boolean, backend: string): boolean =>
	encryptionAvailable && (platform !== "linux" || backend !== "basic_text");
