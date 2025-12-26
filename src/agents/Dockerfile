FROM python:3.13-slim AS base

# Install system dependencies required by LiveKit
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgobject-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder

WORKDIR /builder

COPY pyproject.toml .

RUN mkdir /install && \
  pip install --prefix=/install .

FROM base AS production

WORKDIR /app

ARG DOCKER_USER
USER ${DOCKER_USER}

# Un-privileged user running the application
COPY --from=builder /install /usr/local

COPY . .

CMD ["python", "multi-user-transcriber.py", "start"]
