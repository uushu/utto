# syntax=docker/dockerfile:1.7

FROM python:3.12.13-slim-bookworm AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

COPY pyproject.toml ./
COPY src ./src

RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip wheel --wheel-dir /wheels .


FROM python:3.12.13-slim-bookworm AS runtime

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=builder /wheels /wheels

RUN python -m pip install --no-index --find-links=/wheels utto-server==0.1.0 \
    && rm -rf /wheels \
    && groupadd --system utto \
    && useradd --system --gid utto --no-create-home utto

USER utto

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "utto_server.main:app", "--host", "0.0.0.0", "--port", "8000"]
