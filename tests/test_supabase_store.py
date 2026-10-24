from urllib.error import HTTPError
from urllib.parse import urlsplit

import pytest

from supabase_store import SupabaseStore, SupabaseStoreError


def test_supabase_requests_use_server_key_without_leaking_it(monkeypatch):
    captured = {}

    def fail_request(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        raise HTTPError(
            request.full_url,
            401,
            "Unauthorized",
            {},
            None,
        )

    monkeypatch.setattr("supabase_store.urlopen", fail_request)
    store = SupabaseStore("https://supabase.example/", "sb_secret_test")

    with pytest.raises(SupabaseStoreError) as error:
        store.select("work_projects", select="*", limit=1)

    assert captured["request"].get_header("Apikey") == "sb_secret_test"
    assert captured["request"].get_header("Authorization") is None
    assert urlsplit(captured["request"].full_url).path == "/rest/v1/work_projects"
    assert "sb_secret_test" not in str(error.value)
    assert error.value.status_code == 401


def test_supabase_legacy_key_is_sent_as_bearer_authorization(monkeypatch):
    captured = {}

    def fail_request(request, timeout):
        captured["request"] = request
        raise HTTPError(request.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr("supabase_store.urlopen", fail_request)
    store = SupabaseStore("https://supabase.example", "legacy-server-key")

    with pytest.raises(SupabaseStoreError):
        store.select("work_projects", select="id", limit=1)

    assert captured["request"].get_header("Apikey") == "legacy-server-key"
    assert captured["request"].get_header("Authorization") == "Bearer legacy-server-key"


def test_supabase_store_requires_confirmed_insert_response(monkeypatch):
    monkeypatch.setattr(
        "supabase_store.urlopen",
        lambda request, timeout: _Response(b"[]"),
    )
    store = SupabaseStore("https://supabase.example", "test-server-secret")

    with pytest.raises(SupabaseStoreError, match="did not confirm"):
        store.insert("work_projects", {"title": "Test"})


class _Response:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body
