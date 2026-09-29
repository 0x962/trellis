from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictStr, model_validator


class Harness(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    preset: Literal["claude", "codex", "opencode", "pi", "muse", "custom"]
    startCommand: StrictStr
    resumeCommand: StrictStr
    model: StrictStr | None = None
    effort: StrictStr | None = None

    @model_validator(mode="before")
    @classmethod
    def optional_strings(cls, value):
        for field in ("model", "effort"):
            if field in value and value[field] is None:
                raise ValueError(f"{field}_must_be_absent_or_string")
        return value


class RequestSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    nodeId: StrictStr
    taskKeyBase: StrictStr
    name: StrictStr
    instruction: StrictStr
    harness: Harness | None
    accountId: StrictStr | None = None

    @model_validator(mode="before")
    @classmethod
    def optional_account(cls, value):
        if "accountId" in value and value["accountId"] is None:
            raise ValueError("accountId_must_be_absent_or_string")
        return value


def canonical(value: object) -> str:
    def ordered(item):
        if isinstance(item, list):
            return [ordered(child) for child in item]
        if isinstance(item, dict):
            def key_order(key):
                index = key.isascii() and key.isdigit() and str(int(key)) == key and int(key) < 4294967295
                return (0, int(key)) if index else (1, key.encode("utf-16-be", errors="surrogatepass"))
            return {key: ordered(item[key]) for key in sorted(item, key=key_order)}
        return item
    text = json.dumps(ordered(value), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return "".join(f"\\u{ord(char):04x}" if 0xD800 <= ord(char) <= 0xDFFF else char for char in text)


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def validate_spec(value: dict) -> str:
    RequestSpec.model_validate(value)
    return digest(canonical(value))


def task_key(spec: dict, occurrence: dict) -> str:
    return canonical([spec["taskKeyBase"], occurrence["nodeId"], occurrence["parentOccurrenceKey"],
                      occurrence["phase"], [[item["loopNodeId"], item["round"]]
                                            for item in occurrence["iterationPath"]]])


@dataclass(frozen=True)
class Iteration:
    loop_node_id: str
    round: int


@dataclass(frozen=True)
class VisitScope:
    parent_occurrence_key: str | None
    phase: Literal["step", "children", "condition"]
    iteration_path: tuple[Iteration, ...]
    input_receipt_ids: tuple[str, ...]
    group_deadline_refs: tuple[str, ...]
    deadline_at: str | None

    @classmethod
    def from_engine(cls, value: dict) -> VisitScope:
        return cls(value["parentOccurrenceKey"], value["phase"],
                   tuple(Iteration(item["loopNodeId"], item["round"]) for item in value["iterationPath"]),
                   tuple(value["inputReceiptIds"]), tuple(value["groupDeadlineRefs"]), value["deadlineAt"])

    def occurrence(self, node_id: str, key: str) -> dict:
        return {
            "nodeId": node_id, "occurrenceKey": key,
            "parentOccurrenceKey": self.parent_occurrence_key, "phase": self.phase,
            "iterationPath": [{"loopNodeId": item.loop_node_id, "round": item.round} for item in self.iteration_path],
        }

    def identity(self, vertex_id: str) -> str:
        return digest(canonical([vertex_id, self.parent_occurrence_key, self.phase,
                                 [[item.loop_node_id, item.round] for item in self.iteration_path]]))

    def facts(self) -> dict:
        return {"inputReceiptIds": list(self.input_receipt_ids),
                "groupDeadlineRefs": list(self.group_deadline_refs), "deadlineAt": self.deadline_at}

    def to_engine(self) -> dict:
        return {"parentOccurrenceKey": self.parent_occurrence_key, "phase": self.phase,
                "iterationPath": [{"loopNodeId": item.loop_node_id, "round": item.round}
                                  for item in self.iteration_path], **self.facts()}
