FROM node:24-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
COPY packages/schema packages/schema
RUN npm run build --workspace apps/web

FROM golang:1.25-alpine AS api
WORKDIR /src
COPY go.mod ./
COPY apps/api apps/api
COPY packages/schema packages/schema
RUN CGO_ENABLED=0 go build -o /schooldesk ./apps/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && adduser -D schooldesk
WORKDIR /app
COPY --from=api /schooldesk /app/schooldesk
COPY --from=web /src/apps/web/dist /app/apps/web/dist
USER schooldesk
EXPOSE 8080
ENTRYPOINT ["/app/schooldesk"]
