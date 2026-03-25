FROM python:3.13-alpine3.23 AS base


# Install ffmpeg for audio/video processing (format conversion, extraction, compression)
# See summary/core/file_service.py for usage.
RUN apk add --no-cache "ffmpeg=8.0.1-r1"

FROM base AS builder

WORKDIR /app

COPY pyproject.toml .

RUN pip install --no-cache-dir .

FROM base AS development
WORKDIR /app

COPY . .
RUN pip install --no-cache-dir -e ".[dev]" || pip install --no-cache-dir -e .

CMD ["uvicorn", "summary.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production

WORKDIR /app

COPY --from=builder /usr/local /usr/local

# Remove pip to reduce attack surface in production
RUN pip uninstall -y pip

# Un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

COPY ./summary /app/summary

CMD ["uvicorn", "summary.main:app", "--proxy-headers", "--host", "0.0.0.0", "--port", "8000"]
