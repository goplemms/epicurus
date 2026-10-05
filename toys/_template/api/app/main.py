import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    db.init()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


class Hits(BaseModel):
    count: int


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/hits")
def get_hits() -> Hits:
    with db.connect() as conn:
        (count,) = conn.execute("SELECT count(*) FROM hits").fetchone()
    return Hits(count=count)


@app.post("/hits")
def add_hit() -> Hits:
    with db.connect() as conn:
        conn.execute("INSERT INTO hits DEFAULT VALUES")
        (count,) = conn.execute("SELECT count(*) FROM hits").fetchone()
    return Hits(count=count)
