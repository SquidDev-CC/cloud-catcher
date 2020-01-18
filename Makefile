export PATH := $(shell npm bin):$(PATH)

SRC := $(shell find src public -type f)

SERVER ?= "cloud-catcher.squiddev.cc"

.PHONEY: serve all clean

all: build

clean:
	rm -rf build dist

build: package.json package-lock.json rollup.config.js $(SRC)
	npm run build
	touch build

dist: build
	rm -rf dist
	mkdir dist
	cp package.json package-lock.json dist

	mkdir dist/build
	cp -r build/typescript/*.js build/typescript/server dist/build

	mkdir -p dist/public
	cp build/rollup/* dist/public

	sed -i -e "s/{{version}}/$$(sha1sum "public/assets/main.css" | cut -c-10)/g" dist/public/*

	for file in dist/public/*.js; do terser "$$file" --output "$$file"; done
	for file in dist/public/*.css; do uglifycss "$$file" --output "$$file"; done

serve:
	npm run build
	tsc --project . --watch & \
	rollup -c --watch & \
	node -r esm build/server & \
	wait
