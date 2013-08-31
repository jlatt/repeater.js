source = src/repeater.js
target = build/repeater.js

all: $(target)

build:
	mkdir -pv build

build/repeater.js: $(source) build
	./package.sh < $< > $@

clean:
	rm -rfv build doc

doc/repeater.html: $(target)
	docco --output doc $<

lint: $(source)
	jshint $<

test: $(target)
	phantomjs test/qunit_runner.js test/index.html

.PHONY: all clean lint test
