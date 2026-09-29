from __future__ import annotations

import asyncio


async def finish_capture_task(awaitable):
    task = asyncio.create_task(awaitable)
    cancellation = None
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError as error:
            cancellation = error
    result = task.result()
    if cancellation is not None:
        raise cancellation
    return result
