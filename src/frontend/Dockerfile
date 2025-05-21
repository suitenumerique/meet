FROM node:20-alpine AS frontend-deps

WORKDIR /home/frontend/

COPY ./src/frontend/package.json ./package.json
COPY ./src/frontend/package-lock.json ./package-lock.json

RUN npm ci

COPY .dockerignore ./.dockerignore
COPY ./src/frontend/ .

### ---- Front-end builder image ----
FROM frontend-deps AS meet

WORKDIR /home/frontend

FROM frontend-deps AS meet-dev

WORKDIR /home/frontend

EXPOSE 8080

CMD [ "npm", "run", "dev"]

# Tilt will rebuild Meet target so, we dissociate meet and meet-builder
# to avoid rebuilding the app at every changes.
FROM meet AS meet-builder

WORKDIR /home/frontend

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

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
