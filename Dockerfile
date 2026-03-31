# syntax=docker/dockerfile:1

FROM node:24-alpine AS frontend
WORKDIR /f
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.25.8-alpine AS gobuild
WORKDIR /src
RUN apk add --no-cache ca-certificates git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /f/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=gobuild /out/server /app/server
COPY migrations ./migrations
COPY --from=frontend /f/dist ./frontend/dist
ENV MIGRATIONS_DIR=/app/migrations
ENV FRONTEND_DIST=/app/frontend/dist
EXPOSE 8080
USER nobody
ENTRYPOINT ["/app/server"]
