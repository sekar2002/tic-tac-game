# Build stage - use exact same Go version as Nakama, Debian base for compatibility
FROM golang:1.22.4-bullseye AS builder

WORKDIR /module

# Copy module files
COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./

# Build the shared library
RUN CGO_ENABLED=1 go build -buildmode=plugin -o tictactoe.so main.go

# Output stage
FROM alpine:latest
COPY --from=builder /module/tictactoe.so /output/tictactoe.so
