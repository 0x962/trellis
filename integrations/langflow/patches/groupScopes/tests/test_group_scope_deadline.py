from langflow.services.trellis_v1.group_scope_deadline import GroupDeadlineResult


def test_deadline_result_preserves_order_and_an_unstarted_clock():
    result = GroupDeadlineResult.model_validate({
        "deadline": {
            "deadlineId": "inner-deadline",
            "groupOccurrenceKey": "group-occurrence",
            "budgetMs": 86_460_000,
            "launchedAt": None,
            "deadlineAt": None,
            "launchReceiptId": None,
        },
        "groupDeadlineRefs": ["outer-deadline", "inner-deadline"],
        "deadlineAt": None,
    })
    assert result.group_deadline_refs == ("outer-deadline", "inner-deadline")
    assert result.deadline.budget_ms == 86_460_000
    assert result.deadline.launched_at is None
