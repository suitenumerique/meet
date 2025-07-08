# ---- Front-end image ----
FROM node:20-alpine AS frontend-deps

WORKDIR /home/frontend/

COPY ./src/frontend/package.json ./package.json
COPY ./src/frontend/package-lock.json ./package-lock.json

RUN npm ci

COPY .dockerignore ./.dockerignore
COPY ./src/frontend/ .

### ---- Front-end builder image ----
FROM frontend-deps AS meet-builder

WORKDIR /home/frontend

ENV VITE_APP_TITLE="Visio"
ENV VITE_BUILD_SOURCEMAP="true"

RUN npm run build

COPY ./docker/dinum-frontend/dinum-styles.css \
    ./dist/assets/

COPY ./docker/dinum-frontend/logo.svg \
    ./dist/assets/logo.svg

COPY ./docker/dinum-frontend/assets/ \
    ./dist/assets/

COPY ./docker/dinum-frontend/fonts/ \
    ./dist/assets/fonts/

# ---- Front-end image ----
FROM nginxinc/nginx-unprivileged:alpine3.21 AS frontend-production

USER root
RUN apk update && apk upgrade libssl3 libcrypto3 libxml2>=2.12.7-r2 libxslt>=1.1.39-r2

USER nginx

# Un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

COPY --from=meet-builder \
    /home/frontend/dist \
    /usr/share/nginx/html

COPY ./src/frontend/default.conf /etc/nginx/conf.d
COPY ./docker/files/usr/local/bin/entrypoint /usr/local/bin/entrypoint

ENTRYPOINT [ "/usr/local/bin/entrypoint" ]

CMD ["nginx", "-g", "daemon off;"]
