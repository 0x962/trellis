from pathlib import Path

import httpx


async def request_native_attempt(
	request_bytes: str, *, origin: str, authentication_file: Path, capability_id: str,
) -> str:
	headers = {
		"Content-Type": "application/json",
		"Authorization": f"Bearer {authentication_file.read_bytes().decode('utf-8')}",
		"X-Trellis-Capability-Id": capability_id,
	}
	async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=None) as client:
		response = await client.post(
			f"{origin.rstrip('/')}/api/langflow-private/v1/native-reservations",
			content=request_bytes.encode("utf-8"), headers=headers,
		)
		response.raise_for_status()
		return response.content.decode("utf-8")
