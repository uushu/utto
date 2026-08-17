"""FastAPI application entry point."""

from fastapi import FastAPI

from utto_server.routers import attachments, bootstrap, chat, memories, pairing

app = FastAPI(
    title="utto-server",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/v1/health")
def health() -> dict[str, str]:
    """Return the process-level health status without external dependencies."""
    return {"status": "ok", "service": "utto-server"}


app.include_router(pairing.router)
app.include_router(bootstrap.router)
app.include_router(chat.router)
app.include_router(memories.router)
app.include_router(attachments.router)
