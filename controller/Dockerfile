FROM golang:1.22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache gcc musl-dev

COPY . .
RUN go mod tidy && go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /controller ./cmd/controller

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /controller /controller

EXPOSE 9090

ENTRYPOINT ["/controller"]
