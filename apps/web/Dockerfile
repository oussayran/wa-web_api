FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace @whatsapp-connector/web

FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV NGINX_ENVSUBST_FILTER="^(CSP_API_ORIGIN|CSP_WS_ORIGIN)$"
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
