"""Tests for the private memory archive and prompt retrieval."""

from fastapi.testclient import TestClient

from utto_server.memory import _is_sensitive, _parse_candidates, _should_extract
from utto_server.models import Device, Memory
from utto_server.routers.chat import _system_prompt


def test_memory_archive_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/memories")
    assert response.status_code == 401


def test_user_can_create_list_and_archive_memory(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    created = client.post(
        "/v1/memories",
        headers=auth_headers,
        json={
            "category": "boundary",
            "content": "用户不喜欢被追问。",
            "importance": 5,
        },
    )
    assert created.status_code == 201
    memory = created.json()
    assert memory["status"] == "active"
    assert memory["source"] == "manual"

    listed = client.get("/v1/memories", headers=auth_headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [memory["id"]]

    archived = client.patch(
        f"/v1/memories/{memory['id']}",
        headers=auth_headers,
        json={"status": "archived"},
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    assert client.get("/v1/memories", headers=auth_headers).json() == []


def test_active_memory_is_injected_into_the_system_prompt(
    client: TestClient,
    db,
    device_token_and_relationship: tuple[str, str],
) -> None:
    _, relationship_id = device_token_and_relationship
    db.add(
        Memory(
            relationship_id=relationship_id,
            category="boundary",
            content="用户不喜欢被追问。",
            importance=5,
            sensitivity="standard",
            status="active",
            source="manual",
        )
    )
    db.commit()
    device = db.query(Device).filter(Device.relationship_id == relationship_id).one()

    prompt = _system_prompt(device, db, "你怎么又在问？")

    assert "长期记忆" in prompt
    assert "用户不喜欢被追问。" in prompt
    assert prompt.index("长期记忆") < prompt.index("最终回复规则")


def test_sensitive_content_never_relies_on_the_model_label() -> None:
    assert _is_sensitive(
        {
            "category": "fact",
            "content": "用户最近在医院复诊。",
            "importance": 4,
            "sensitivity": "standard",
        }
    )


def test_only_explicit_long_term_statements_are_sent_for_extraction() -> None:
    assert _should_extract([{"role": "user", "content": "不好"}]) is None
    assert _should_extract([{"role": "user", "content": "你现在有记忆了吗"}]) is None
    assert _should_extract([{"role": "user", "content": "以后别追问我。"}]) == "以后别追问我。"


def test_extraction_candidate_requires_a_stable_dedupe_key() -> None:
    assert _parse_candidates(
        '[{"category":"boundary","content":"用户不喜欢被追问","importance":4}]'
    ) == []
    candidates = _parse_candidates(
        '[{"category":"boundary","key":"boundary.follow_up","content":"用户不喜欢被追问","importance":4,"sensitivity":"standard"}]'
    )
    assert candidates[0]["key"] == "boundary.follow_up"
