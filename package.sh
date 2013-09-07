#!/bin/bash
cat <<EOF
(function(_, $) {
'use strict';

$(cat)

}).call(this, _, jQuery);
EOF
