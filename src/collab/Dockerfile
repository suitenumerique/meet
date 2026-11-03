FROM node:22.23.4-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 1234

ENV PORT=1234
ENV HOST=0.0.0.0

CMD ["node", "server.mjs"]
