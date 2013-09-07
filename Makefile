target = build/repeater.js

all: docs

doc/repeater.html: $(target)
	docco --output doc $<

docs: doc/repeater.html

.PHONY: all docs
