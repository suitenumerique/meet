FROM python:3.13-slim AS base

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