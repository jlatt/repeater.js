source = src/depstate.js
target = build/depstate.js

all: $(target)

build:
	mkdir -pv build

build/depstate.js: $(source) build
	./package.sh < $< > $@

clean:
	rm -rfv build doc

doc/depstate.html: $(target)
	docco --output doc $<

lint: $(source)
	jshint $<

test: $(target)
	phantomjs test/qunit_runner.js test/index.html

.PHONY: all clean lint test
