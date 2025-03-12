GOOS=js GOARCH=wasm go build -o main.wasm main.go

cp main.wasm ../static/
