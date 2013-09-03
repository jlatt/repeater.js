function testConstructor(Constructor) {
    test('constructor', function() {
        ok(new repeater[Constructor]());
    });
}


function testClass(Constructor) {
    var args = _(arguments).slice(1);
    var body = args.pop();
    args.push(function() {
        return body.call(this, new repeater[Constructor]());
    });
    return test.apply(this, args);
}

module('VectorClock');

testConstructor('VectorClock');

testClass('VectorClock', 'get', function(vc) {
    _.times(10, function(i) {
        strictEqual(vc.get(i), 0);
    }, this);

    _.times(10, function(i) {
        vc.keys[i] = i + 1;
    }, this);

    _.times(10, function(i) {
        strictEqual(vc.get(i), i + 1);
    }, this);
});

testClass('VectorClock', 'has', function(vc) {
    _.times(10, function(i) {
        strictEqual(vc.has(i), false);
    }, this);

    _.times(10, function(i) {
        vc.keys[i] = i + 1;
    }, this);

    _.times(10, function(i) {
        strictEqual(vc.has(i), true);
    }, this);
});

testClass('VectorClock', 'next', function(vc1) {
    var key = 502;
    function check1() {
        strictEqual(vc1.get(key), 0, 'vc1 key is 0');
    }
    check1();
    var vc2 = vc1.next(key);
    function check2() {
        strictEqual(vc2.get(key), 1, 'vc2 key is 1');
    }
    check2();
    check1();
    var vc3 = vc2.next(key);
    function check3() {
        strictEqual(vc3.get(key), 2, 'vc3 key is 2');
    }
    check3();
    check2();
    check1();
    var vc4 = vc1.next(key);
    strictEqual(vc4.get(key), 1, 'vc4 key is 1');
    check3();
    check2();
    check1();
});

testClass('VectorClock', 'merge', function(vc1) {
    var loop = 5;
    _.times(loop, function(i) {
        vc1.keys[i] = i + 1;
    }, this);

    var vc2 = new repeater.VectorClock();
    _.times(loop, function(i) {
        vc2.keys[i] = (2 * i) + 1;
    }, this);

    var vc3 = vc1.merge(vc2);
    _.times(loop, function(i) {
        strictEqual(vc3.get(i), vc2.get(i), 'vc2 and vc3 have same ' + i);
    }, this);
});

module('Repeater');

testConstructor('Repeater');

testClass('Repeater', 'emit', 6, function(r) {
    r.onEmit.add(function(values) {
        strictEqual(values.length, 1);
        strictEqual(values[0], true);
    });
    r.emit(true);
    r.emit(true);
    r.emit(true);
});

function TestMapper(expected) {
    this.expected = expected;
}

TestMapper.prototype.apply = function(context, values) {
    var exp = this.expected.shift();
    strictEqual(values[0], exp, 'emits ' + exp);
};

testClass('Repeater', 'map', 3, function(r1) {
    var r2 = r1.map(function(a, b, c) {
        return a + b - c;
    });
    notEqual(r2.id, r1.id, 'r1 and r2 have different ids');
    r2.map(new TestMapper([5, 5]));
    r1.emit(10, 3, 8);
    r1.emit(6, 0, 1);
});

testClass('Repeater', 'filter', function(r1) {
    var r2 = r1.filter(function(v) {
        return v > 5;
    });
    r2.map(new TestMapper(_.range(6, 11)));
    _.chain(1).range(11).each(function(v) {
        r1.emit(v);
    }, this);
});

testClass('Repeater', 'unique', 4, function(r1) {
    var r2 = r1.unique();
    r2.map(new TestMapper([1, 2, 3, 2]));
    _.each([1, 1, 2, 3, 3, 2], function(v) {
        r1.emit(v);
    }, this);
});

module('RepeaterProxy');

testConstructor('RepeaterProxy');