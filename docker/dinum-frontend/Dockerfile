# ---- Front-end image ----
FROM node:20-alpine AS frontend-deps

WORKDIR /home/frontend/

COPY ./src/frontend/package.json ./package.json
COPY ./src/frontend/package-lock.json ./package-lock.json

RUN npm ci

COPY .dockerignore ./.dockerignore
COPY ./src/frontend/ .

# ---- Front-end builder image ----
FROM frontend-deps AS meet-builder

WORKDIR /home/frontend

ENV VITE_APP_TITLE="Visio"
ENV VITE_BUILD_SOURCEMAP="true"

RUN npm run build

# Inject PostHog sourcemap metadata into the built assets
# This metadata is essential for correctly mapping errors to source maps in production
RUN set -e && \
    npx @posthog/cli@0.4.8 sourcemap inject --directory ./dist/assets

COPY ./docker/dinum-frontend/dinum-styles.css \
    ./dist/assets/

COPY ./docker/dinum-frontend/logo.svg \
    ./dist/assets/logo.svg

COPY ./docker/dinum-frontend/assets/ \
    ./dist/assets/

COPY ./docker/dinum-frontend/fonts/ \
    ./dist/assets/fonts/

# ---- Addons builder image ----
FROM node:20-alpine AS addons-builder

WORKDIR /home/addons/outlook

COPY ./src/addons/outlook/package.json ./package.json
COPY ./src/addons/outlook/package-lock.json ./package-lock.json

RUN npm ci

COPY ./src/addons/outlook/ .

RUN npx webpack --mode production


# ---- Front-end image ----
FROM nginxinc/nginx-unprivileged:alpine3.23 AS frontend-production

USER root

# Security patches for known CVEs
RUN apk update && apk upgrade  \
    musl \
    musl-utils \
    zlib>=1.3.2-r0 \
    && apk del curl

USER nginx

# Un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

COPY --from=meet-builder \
    /home/frontend/dist \
    /usr/share/nginx/html

COPY --from=addons-builder \
    /home/addons/outlook/dist \
    /usr/share/nginx/html/addons/outlook

COPY ./docker/dinum-frontend/nginx/default.conf /etc/nginx/conf.d
COPY ./docker/files/usr/local/bin/entrypoint /usr/local/bin/entrypoint

ENTRYPOINT [ "/usr/local/bin/entrypoint" ]

CMD ["nginx", "-g", "daemon off;"]
