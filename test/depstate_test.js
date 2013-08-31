function testConstructor(Constructor) {
    test('constructor', function() {
        ok(new depstate[Constructor]());
    });
}


function testClass(Constructor) {
    var args = _(arguments).slice(1);
    var body = args.pop();
    args.push(function() {
        return body.call(this, new depstate[Constructor]());
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
    strictEqual(vc1.get(key), 0);
    var vc2 = vc1.next(key);
    strictEqual(vc2.get(key), 1);
    strictEqual(vc1.get(key), 0);
    var vc3 = vc2.next(key);
    strictEqual(vc3.get(key), 2);
    strictEqual(vc2.get(key), 1);
    strictEqual(vc1.get(key), 0);
    var vc4 = vc1.next(key);
    strictEqual(vc4.get(key), 1);
    strictEqual(vc3.get(key), 2);
    strictEqual(vc2.get(key), 1);
    strictEqual(vc1.get(key), 0);
});

testClass('VectorClock', 'merge', function(vc1) {
    var loop = 5;
    _.times(loop, function(i) {
        vc1.keys[i] = i + 1;
    }, this);

    var vc2 = new depstate.VectorClock();
    _.times(loop, function(i) {
        vc2.keys[i] = (2 * i) + 1;
    }, this);

    var vc3 = vc1.merge(vc2);
    _.times(loop, function(i) {
        strictEqual(vc2.get(i), vc3.get(i));
    }, this);
});

module('Repeater');

testConstructor('Repeater');

testClass('Repeater', 'emit', 6, function(r) {
    r.onEmit.add(function(id, values, clock) {
        strictEqual(values.length, 1);
        strictEqual(values[0], true);
    });
    r.emit(true);
    r.emit(true);
    r.emit(true);
});

testClass('Repeater', 'map', 2, function(r1) {
    var r2 = r1.map(function(a, b, c) {
        return a + b - c;
    });

    notEqual(r1.id, r2.id);

    r2.onEmit.add(function(id, values, clock) {
        strictEqual(values[0], 5);
    });

    r1.emit(10, 3, 8);
});

module('RepeaterProxy');

testConstructor('RepeaterProxy');
