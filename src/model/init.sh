cd cashu
GOOS=js GOARCH=wasm go build -o main.wasm main.go
cd ..

cp cashu/main.wasm ../../static/cashu.wasm

cd nostr
GOOS=js GOARCH=wasm go build -o main.wasm main.go
cd ..

cp nostr/main.wasm ../../static/nostr.wasm
