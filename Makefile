export PATH := $(shell npm bin):$(PATH)

TS := $(shell find src -type f \( -name '*.ts' -or -name '*.tsx' \) )
LUA := $(shell find src -type f -name '*.lua')
BUILD_TS := $(TS:src/%=build/%)

SERVER ?= "cloud-catcher.squiddev.cc"

.PHONEY: lint serve all clean

all: public/assets/main.js build

clean:
	rm -rf build dist public/cloud.lua public/assets/main.js

dist: package.json package-lock.json build public/index.html public/404.html public/assets/main.css public/assets/main.js public/assets/monaco-worker.js public/assets/termFont.png public/cloud.lua
	rm -rf dist
	mkdir dist
	cp package.json package-lock.json dist

	mkdir dist/build
	cp -r build/*.js build/server dist/build

	mkdir -p dist/public

	cp public/index.html dist/public
	cp public/404.html dist/public
	cp public/cloud.lua dist/public

	sed -i -e "s/CSS_VERSION/$$(sha1sum "public/assets/main.css" | cut -c-10)/g" dist/public/*.html
	sed -i -e "s/JS_VERSION/$$(sha1sum "public/assets/main.js" | cut -c-10)/g" dist/public/*.html

	mkdir -p dist/public/assets
	cp public/assets/termFont.png dist/public/assets
	uglifycss public/assets/main.css > dist/public/assets/main.css
	uglifyjs public/assets/main.js > dist/public/assets/main.js
	uglifyjs public/assets/monaco-worker.js > dist/public/assets/monaco-worker.js

lint: $(TS) tsconfig.json tslint.json
	tslint --project tsconfig.json

build: $(TS) tsconfig.json
	tsc --project tsconfig.json
	touch build

public/assets/main.js: build
	rollup -c

public/cloud.lua: $(LUA)
	cd src/host; \
	lua _make.lua ../../public/cloud.lua "$(SERVER)"

serve: build public/cloud.lua
	tsc --project tsconfig.json --watch & \
	rollup -c --watch & \
	node -r esm build/server & \
	wait
