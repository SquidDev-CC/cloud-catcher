export PATH := $(shell npm bin):$(PATH)

TS := $(shell find src -type f \( -name '*.ts' -or -name '*.tsx' \) )
LUA := $(shell find src -type f -name '*.lua')
BUILD_TS := $(TS:src/%=build/%)

.PHONEY: lint serve all clean

all: public/assets/main.js build

clean:
	rm -rf build dist

dist: package.json package-lock.json build public/index.html public/assets/main.css public/assets/main.js public/assets/termFont.png public/cloud.lua
	rm -rf dist
	mkdir dist
	cp package.json package-lock.json dist

	mkdir dist/build
	cp -r build/*.js build/server dist/build

	mkdir -p dist/public/assets
	cp public/index.html dist/public
	cp public/cloud.lua dist/public
	cp public/assets/termFont.png dist/public/assets
	uglifycss public/assets/main.css > dist/public/assets/main.css
	uglifyjs public/assets/main.js > dist/public/assets/main.js

lint: $(TS) tsconfig.json tslint.json
	tslint --project tsconfig.json

build: $(TS) tsconfig.json
	tsc --project tsconfig.json
	touch build

public/assets/main.js: build
	rollup -c

public/cloud.lua: $(LUA)
	cd src/host; \
	if [ -z "${cloudCatcherServerURL+x}" ]; then cloudCatcherServerURL="://cloud-catcher.squiddev.cc"; fi # see https://stackoverflow.com/a/13864829
	lua _make.lua ../../public/cloud.lua "$(cloudCatcherServerURL)"

serve: build
	tsc --project tsconfig.json --watch & \
	rollup -c --watch & \
	node -r esm build/server & \
	wait
