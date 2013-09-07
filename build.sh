#!/bin/bash
docco --output doc build/repeater.js
git add doc/
git ci -m docs
