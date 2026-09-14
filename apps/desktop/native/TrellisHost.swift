import Darwin
import Foundation
import ServiceManagement

let plistName = "com.trellis.desktop.host.plist"
let service = SMAppService.agent(plistName: plistName)
let command = CommandLine.arguments.dropFirst().first ?? "status"

func emitStatus() throws {
	let name: String
	switch service.status {
	case .notRegistered: name = "notRegistered"
	case .enabled: name = "enabled"
	case .requiresApproval: name = "requiresApproval"
	case .notFound: name = "notFound"
	@unknown default: name = "unknown"
	}
	let data = try JSONSerialization.data(withJSONObject: [
		"status": name, "bundle": Bundle.main.bundlePath,
	])
	print(String(data: data, encoding: .utf8)!)
}

func run() throws {
	switch command {
	case "status": try emitStatus()
	case "register":
		try service.register()
		try emitStatus()
	case "unregister":
		try service.unregister()
		try emitStatus()
	case "settings": SMAppService.openSystemSettingsLoginItems()
	case "serve":
		var size: UInt32 = 0
		_NSGetExecutablePath(nil, &size)
		var executable = [CChar](repeating: 0, count: Int(size))
		_NSGetExecutablePath(&executable, &size)
		let contents = URL(fileURLWithPath: String(cString: executable)).resolvingSymlinksInPath()
			.deletingLastPathComponent().deletingLastPathComponent()
		let home =
			ProcessInfo.processInfo.environment["TRELLIS_DESKTOP_HOME"]
			?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
				"Library/Application Support/Trellis/host"
			).path
		try FileManager.default.createDirectory(
			atPath: home, withIntermediateDirectories: true,
			attributes: [.posixPermissions: 0o700])
		let log = open(home + "/desktop-host.log", O_WRONLY | O_CREAT | O_APPEND, 0o600)
		guard log >= 0 else { fatalError("Could not open the host log") }
		dup2(log, STDOUT_FILENO)
		dup2(log, STDERR_FILENO)
		close(log)
		let node = contents.appendingPathComponent("Resources/host/bin/node").path
		let entry = contents.appendingPathComponent("Resources/host-service.cjs").path
		let arguments: [UnsafeMutablePointer<CChar>?] =
			[node, entry].map { value in value.withCString { strdup($0) } } + [nil]
		arguments.withUnsafeBufferPointer { buffer in
			_ = execv(node, buffer.baseAddress!)
		}
		fatalError("Could not execute the bundled host runtime: errno \(errno)")
	default: fatalError("Unknown service command")
	}

}
do {
	try run()
} catch {
	FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
	exit(1)
}
