FROM python:3.12-slim AS builder

WORKDIR /app

COPY pyproject.toml .

RUN pip3 install --no-cache-dir .

FROM python:3.12-slim AS production

WORKDIR /app

COPY --from=builder /usr/local /usr/local
COPY . .

# Un-privileged user running the application
ARG DOCKER_USER=1000:1000
USER ${DOCKER_USER}

CMD ["python", "agent.py", "start"]
