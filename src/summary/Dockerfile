FROM python:3.15.2-alpine3.24 AS base

RUN apk add --no-cache --upgrade 'ca-certificates>=20261020-r0' \
    'musl-utils>=1.2.6-r3'


# Install ffmpeg for audio/video processing (format conversion, extraction, compression)
# See summary/core/file_service.py for usage.
RUN apk add --no-cache "ffmpeg=8.1.3-r0" 'brotli-libs>=1.2.1-r0'


FROM base AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /uvx /bin/

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev


FROM base AS development

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /uvx /bin/

WORKDIR /app

COPY . /app

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --all-extras

ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "summary.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


FROM base AS production

WORKDIR /app

COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH"

# Remove pip to reduce attack surface in production
RUN pip uninstall -y pip

# Un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

CMD ["uvicorn", "summary.main:app", "--proxy-headers", "--host", "0.0.0.0", "--port", "8000"]
