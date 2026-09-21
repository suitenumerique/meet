# ---- Front-end image ----
FROM node:22-alpine AS frontend-deps

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

# ---- Caddy builder image ----
FROM caddy:2.11.4-builder AS caddy-builder

RUN xcaddy build --with github.com/caddyserver/replace-response
RUN apk add --no-cache libcap && \
    setcap -r /usr/bin/caddy

# ---- Front-end image ----
FROM gcr.io/distroless/static-debian12:nonroot AS frontend-production

COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy

COPY --from=meet-builder \
    /home/frontend/dist \
    /usr/share/nginx/html

COPY --from=addons-builder \
    /home/addons/outlook/dist \
    /usr/share/nginx/html/addons/outlook

COPY ./docker/dinum-frontend/Caddyfile /etc/caddy/Caddyfile
COPY ./docker/caddy/media-proxy.caddy /etc/caddy/media-proxy.caddy

ENV PORT=8080

ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
