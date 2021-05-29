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

	mkdir -p dist
	cp build/rollup/* dist

	sed -i -e "s/{{version}}/$$(sha1sum "dist/index.css" | cut -c-10)/g" dist/*

	for file in dist/*.js; do terser "$$file" --output "$$file"; done
	for file in dist/*.css; do uglifycss "$$file" --output "$$file"; done

serve:
	npm run build
	rollup -c --watch & \
	node -r esm build/server/server & \
	wait
