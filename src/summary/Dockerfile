FROM python:3.13-slim AS builder

WORKDIR /app

COPY pyproject.toml .

RUN pip3 install --no-cache-dir .

FROM python:3.13-slim AS production

WORKDIR /app

COPY --from=builder /usr/local /usr/local
COPY ./summary /app/summary

# Un-privileged user running the application
ARG DOCKER_USER=1000:1000
USER ${DOCKER_USER}

CMD ["uvicorn", "summary.main:app", "--proxy-headers", "--host", "0.0.0.0", "--port", "8000"]
