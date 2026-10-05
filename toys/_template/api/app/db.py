import os
import sqlite3
from collections.abc import Generator
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", "toy.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS hits (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


@contextmanager
def connect() -> Generator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
