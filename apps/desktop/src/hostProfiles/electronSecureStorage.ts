import { safeStorage } from "electron";
import type { SecureStorage } from "./credentialStore.ts";

export const electronSecureStorage = (platform = process.platform): SecureStorage => ({
	available: () =>
		safeStorage.isEncryptionAvailable() &&
		(platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
	encrypt: (value) => safeStorage.encryptString(value),
	decrypt: (value) => safeStorage.decryptString(value),
});
