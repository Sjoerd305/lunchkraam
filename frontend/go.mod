// Separate module so root `go list ./...` / staticcheck do not descend into
// npm's tree (e.g. flatted's bundled Go package).
module lunchkraam/frontend

go 1.26

toolchain go1.26.2
