FROM python:3.13-slim AS base

FROM base AS builder

WORKDIR /app

COPY pyproject.toml .

RUN pip3 install --no-cache-dir .

FROM base AS production

WORKDIR /app

# Un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

COPY --from=builder /usr/local /usr/local
COPY ./summary /app/summary

CMD ["uvicorn", "summary.main:app", "--proxy-headers", "--host", "0.0.0.0", "--port", "8000"]
