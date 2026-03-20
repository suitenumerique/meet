FROM python:3.13-slim AS base

# Install system dependencies required by LiveKit
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgobject-2.0-0 \
    "openssl=3.5.4-1~deb13u2" \
    "libssl3t64=3.5.4-1~deb13u2" \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder

WORKDIR /builder

COPY pyproject.toml .

RUN mkdir /install && \
  pip install --prefix=/install .

FROM base AS production

WORKDIR /app

# Remove pip to reduce attack surface in production
RUN pip uninstall -y pip

ARG DOCKER_USER
USER ${DOCKER_USER}

# Un-privileged user running the application
COPY --from=builder /install /usr/local

COPY . .

CMD ["python", "multi-user-transcriber.py", "start"]
