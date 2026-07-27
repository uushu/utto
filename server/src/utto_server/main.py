"""FastAPI application entry point."""

from fastapi import FastAPI

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
