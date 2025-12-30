FROM python:3.13-slim AS base


# Install ffmpeg for audio/video processing (format conversion, extraction, compression)
# See summary/core/file_service.py for usage.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg=7:7.1.3-* && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

FROM base AS builder

WORKDIR /app

COPY pyproject.toml .

RUN pip3 install --no-cache-dir .

FROM base AS development
WORKDIR /app

COPY . .
RUN pip3 install --no-cache-dir -e ".[dev]" || pip3 install --no-cache-dir -e .

CMD ["uvicorn", "summary.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production

WORKDIR /app

# Un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

COPY --from=builder /usr/local /usr/local
COPY ./summary /app/summary

CMD ["uvicorn", "summary.main:app", "--proxy-headers", "--host", "0.0.0.0", "--port", "8000"]
