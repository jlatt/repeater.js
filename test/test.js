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

testClass('VectorClock', 'increment', function(vc1) {
    var key = 502;
    function check1() {
        strictEqual(vc1.get(key), 0, 'vc1 key is 0');
    }
    check1();
    var vc2 = vc1.increment(key);
    function check2() {
        strictEqual(vc2.get(key), 1, 'vc2 key is 1');
    }
    check2();
    check1();
    var vc3 = vc2.increment(key);
    function check3() {
        strictEqual(vc3.get(key), 2, 'vc3 key is 2');
    }
    check3();
    check2();
    check1();
    var vc4 = vc1.increment(key);
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

testClass('Repeater', 'id', function(r1) {
    var r2 = r1.map(_.identity);
    notEqual(r2.id, r1.id, 'r1 and r2 have different ids');
});

testClass('Repeater', 'emit', 6, function(r) {
    r.onEmit.add(function(values) {
        strictEqual(values.length, 1);
        strictEqual(values[0], true);
    });
    r.emit(true);
    r.emit(true);
    r.emit(true);
});

function TestMapper(expected, test) {
    this.expected = expected;
    if (_.isFunction(test)) {
        this.test = test;
    }
}

TestMapper.deepEqual = function(values, exp) {
    return deepEqual(values, exp, 'emits' + JSON.stringify(values));
};

TestMapper.prototype.test = function(values, exp) {
    strictEqual(values[0], exp, 'emits ' + exp);
};

TestMapper.prototype.apply = function(context, values) {
    var exp = this.expected.shift();
    this.test(values, exp, 'emits ' + exp);
};

testClass('Repeater', 'map', function(repeater) {
    var expected = [5, 5];
    expect(expected.length);
    repeater
        .map(function(a, b, c) { return a + b - c; })
        .map(new TestMapper(expected));
    repeater
        .emit(10, 3, 8)
        .emit(6, 0, 1);
});

testClass('Repeater', 'lastN', function(repeater) {
    var expected = [[1], [2, 1], [3, 2, 1], [4, 3, 2]];
    expect(expected.length);
    repeater
        .lastN(3)
        .map(new TestMapper(expected, TestMapper.deepEqual));
    _.chain(1).range(5).each(function(v) {
        repeater.emit(v);
    }, this);
});

testClass('Repeater', 'repeatSame', function(repeater) {
    var send = [{'foo': true}, {'foo': true}, {'foo': false}];
    var expected = [send[0], send[0], send[2]];
    expect(expected.length);
    repeater
        .repeatSame()
        .map(new TestMapper(expected));
    _.each(send, function(value) {
        repeater.emit(value);
    }, this);
});

module('RepeaterProxy');

testConstructor('RepeaterProxy');
