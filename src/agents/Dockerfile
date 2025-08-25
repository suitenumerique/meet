FROM python:3.13-slim AS builder

WORKDIR /builder

COPY pyproject.toml .

RUN mkdir /install && \
  pip install --prefix=/install .

FROM python:3.13-slim AS production

WORKDIR /app

ARG DOCKER_USER
USER ${DOCKER_USER}

# Un-privileged user running the application
COPY --from=builder /install /usr/local

COPY . .

CMD ["python", "multi-user-transcriber.py", "start"]
