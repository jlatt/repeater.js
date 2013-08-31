target = build/depstate.js

all: $(target)

build:
	mkdir -p build

build/depstate.js: src/depstate.js build
	./package.sh < $< > $@

clean:
	rm -rf build docs

docs: $(target)
	mkdir -p docs

docs/depstate.html: $(target)
	docco $<

test: $(target)
	phantomjs test/qunit_runner.js test/index.html

.PHONY: all clean test
