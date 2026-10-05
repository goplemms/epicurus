from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    return TestClient(app)


def test_hits_round_trip(client: TestClient) -> None:
    with client:
        assert client.get("/hits").json() == {"count": 0}
        assert client.post("/hits").json() == {"count": 1}
        assert client.get("/hits").json() == {"count": 1}
