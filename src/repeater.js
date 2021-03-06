// Create a new instance of a class.
function create() {
    /* jshint newcap:false */
    return new this();
}

// Make `Heir` a prototypal child of `this`.
function beget(Heir) {
    Heir.prototype = new this.Prototype(Heir);
    return Heir;
}

// Make a side-effect-free constructor for this function's prototype.
function makeConstructor(Target) {
    function Prototype(Constructor) {
        this.constructor = Constructor; // `this` is a prototype
    }
    Prototype.prototype = Target.prototype;

    Target.beget = beget;
    Target.Prototype = Prototype;
    return Target;
}

// Create an object that behaves like an applyable function, but provides a
// varargs-like interface for the supplied `values`.
function FunctionLike() {}

makeConstructor(FunctionLike);

FunctionLike.prototype.apply = function(context, values) {
    return this.run.apply(this, values);
};

FunctionLike.prototype.run = $.noop;

// ## Vector Clocks
//
// [Vector Clocks](http://en.wikipedia.org/wiki/Vector_clock) provide event
// ordering without requiring time-based synchronization between multiple
// threads of execution.
//     Key := Integer String
//     Count := Number, int >= 0
/* */

// Create a new vector clock.
//
//     return := VectorClock
function VectorClock() {
    this.keys = {};
}

// ### instance methods

VectorClock.prototype.toString = function() {
    return JSON.stringify(this);
};

VectorClock.prototype.toJSON = function() {
    return this.keys;
};

// Get the keyed value, returning a default if necessary.
//
//     key := Key
//     return := Count
VectorClock.prototype.get = function(key) {
    return this.has(key) ? this.keys[key] : 0;
};

VectorClock.prototype.has = function(key) {
    return this.keys.hasOwnProperty(key);
};

// ### constructors

// Return a new clock with a single key incremented.
//
//     key := Key
//     return := VectorClock
VectorClock.prototype.increment = function(key) {
    var incremented = new VectorClock();
    _.extend(incremented.keys, this.keys);
    incremented.keys[key] = this.get(key) + 1;
    return incremented;
};

// Merge a clock into this clock, taking the maximum counts from each key
// present in each clock.
VectorClock.prototype.merge = function(incoming) {
    var outgoing = new VectorClock();
    _.extend(outgoing.keys, this.keys);
    _.each(incoming.keys, function(count, key) {
        outgoing.keys[key] = Math.max(outgoing.get(key), count);
    }, this);
    return outgoing;
};

// Marshall a clock instance from JSON.
VectorClock.fromJSON = function(obj) {
    var vc = new VectorClock();
    _.extend(vc.keys, obj);
    return vc;
};

// Create a new repeater with an optional repeater (or repeater-like) source.
function Repeater(source/*?*/) {
    this.id = this.idSequence.next();
    this.onEmit = $.Callbacks('memory');
    this.onCancel = $.Callbacks('memory once');
    _.bindAll(this, 'onReceive');
    if (_.isObject(source)) {
        this.addSource(source);
    }
}

makeConstructor(Repeater);

// Start with an empty clock for all repeaters.
Repeater.prototype.clock = new VectorClock();

// Produce a monotonically increasing series of ids for all repeater types.
Repeater.prototype.idSequence = {
    'current': 0,

    'next': function() {
        var next = this.current;
        this.current += 1;
        return next;
    }
};

// End a repeater stream. Fire cancel callbacks to release resources.
Repeater.prototype.cancel = function() {
    this.onEmit
        .disable()
        .empty();
    this.onCancel
        .fire(this, [this])
        .empty();
    return this;
};

// Emit a varargs sequence of values. See `emitMany` for more information.
Repeater.prototype.emit = function(/*value, ...*/) {
    return this.emitMany(arguments);
};

// Emit an arraylike of values. Internal clocks are updated.
Repeater.prototype.emitMany = function(values) {
    this.clock = this.clock.increment(this.id);
    this.onEmit.fireWith(this, [values, this.clock, this]);
    return this;
};

// Merge the clock for incoming values and emit them.
Repeater.prototype.onReceive = function(values, clock/*, source*/) {
    this.clock = this.clock.merge(clock);
    this.emitMany(values);
};

// Add a receiver-like as a source. This is a helpful convenience used in
// chaining repeaters.
Repeater.prototype.addSource = function(source) {
    this.onCancel.add(function() {
        source.onEmit.remove(this.onReceive);
    });
    source.onEmit.add(this.onReceive);
    return this;
};

// Return `true` iff `source` has `this` attached to its emitter callbacks.
Repeater.prototype.hasSource = function(source) {
    return source.onEmit.has(this.onReceive);
};

// ### map

function MapRepeater(source, mapFunc) {
    Repeater.call(this, source);
    this.mapFunc = mapFunc;
}

Repeater.beget(MapRepeater);

MapRepeater.prototype.onReceive = function(values, clock) {
    // Values are applied varargs-style.
    var value = this.mapFunc.apply(this, values);
    Repeater.prototype.onReceive.call(this, [value], clock);
};

// Map values from a repeater through a function. `map` may be a function or
// function-like object.
//
//     map := Repeater function(Value, ...) { } Value
Repeater.prototype.map = function(map) {
    return new MapRepeater(this, map);
};

// lastN

function LastNRepeater(source, n) {
    Repeater.call(this, source);
    this.n = n;
    this.values = [];
}

Repeater.beget(LastNRepeater);

LastNRepeater.prototype.onReceive = function(values, clock) {
    this.values = this.values.slice(0, this.n - 1);
    this.values.unshift(values[0]);
    Repeater.prototype.onReceive.call(this, this.values, clock);
};

// Emit the last `n` values as an array. This repeaters expects a single
// argument (and not an array of values).
//
//     n := Integer > 1
Repeater.prototype.lastN = function(n) {
    return new LastNRepeater(this, n);
};

// repeatSame

// `repeatSame` has no state, so a single instance is safe.
var repeatSame = new FunctionLike();

repeatSame.run = function(current, previous) {
    return _.isEqual(previous, current) ? previous : current;
};

// Considering the last two received values, emit the previous one if the two
// compare equal.
Repeater.prototype.repeatSame = function() {
    return this
        .lastN(2)
        .map(repeatSame);
};

function ChainPromise() {}

FunctionLike.beget(ChainPromise);

ChainPromise.prototype.current = null;

ChainPromise.prototype.run = function(current) {
    var previous = this.current;
    this.current = current;
    if (previous === null) {
        return current;
    }
    function after() {
        return current;
    }
    return previous.then(after, after);
};

// Chain promises received from a repeater. Promises returned from this repeater
// won't complete until after the previously received promise completes. Each
// promise is chained on the previous one. This map is useful when promises
// represent actions with side effects that must be incorporated in to the
// program state before starting a new action.
Repeater.prototype.chainPromise = function() {
    return this.map(new ChainPromise());
};

function LastPromiseRepeater(source) {
    Repeater.call(this, source);
}

Repeater.beget(LastPromiseRepeater);

LastPromiseRepeater.prototype.deferred = null;

LastPromiseRepeater.prototype.current = null;

LastPromiseRepeater.prototype.onReceive = function(values, clock) {
    var newDeferred = this.deferred === null;
    if (newDeferred) {
        this.deferred = $.Deferred();
    }

    var current = this.current = values[0];
    var repeater = this;
    this.clock = this.clock.merge(clock);
    this.current.then(function() {
        repeater.onResolve(current, this, arguments);
    }, this);

    if (newDeferred) {
        this.emit(this.deferred.promise());
    }
};

LastPromiseRepeater.prototype.onResolve = function(promise, context, args) {
    if (this.current !== promise) {
        return;
    }
    var deferred = this.deferred;
    delete this.deferred;
    deferred.resolveWith(context, args);
};

// Expect to receive promises. Emit a promise that resolves with the most
// recently received promise. Emit new promises on receive after the previously
// emitted promise resolves.
Repeater.prototype.lastPromise = function() {
    return new LastPromiseRepeater(this);
};

function UnPromiseRepeater(source) {
    Repeater.call(this, source);
}

Repeater.beget(UnPromiseRepeater);

UnPromiseRepeater.prototype.onReceive = function(values, clock) {
    values[0].then(_.bind(function() {
        Repeater.prototype.onReceive.call(this, arguments, clock);
    }, this));
};

// Unwrap resolved promise containers into values. No order is guaranteed. To
// impose order, call this function on a repeater chain with `chainPromise` or
// `lastPromise`.
Repeater.prototype.unpromise = function() {
    return new UnPromiseRepeater(this);
};

function AbortPreviousXHRMap() {}

AbortPreviousXHRMap.prototype.current = null;

AbortPreviousXHRMap.prototype.apply = function(context, values) {
    var previous = this.current;
    var promise = this.current = values[0];
    if (!_.isNull(previous) && _.isFunction(previous.abort)) {
        try {
            previous.abort();
        } catch (ex) {}
    }
    return promise;
};

// When receiving a new XHR, attempt to abort the previous XHR in progress. This
// map is useful when XHRs are idempotent actions, such as an HTTP GET.
Repeater.prototype.abortPreviousXHR = function() {
    return this.map(new AbortPreviousXHRMap());
};

// ### class methods

Repeater.create = create;

// Run `sample` every `wait` milliseconds, emitting its return value.
Repeater.sample = function(sample, wait) {
    // TODO class-ify
    var repeater = this.create();
    var handle = window.setInterval(sample, wait);
    repeater.onCancel.add(function() {
        window.clearInterval(handle);
    });
    return repeater;
};

// join

function VectorClockArray() {
    this.clocks = [];
}

VectorClockArray.prototype.set = function(index, clock) {
    this.clocks[index] = clock;
    return this;
};

// Attempt to merge several vector clocks together. If clocks diverge on any
// keys, return `null`.
//
//     return := VectorClock || null
VectorClockArray.prototype.merge = function() {
    if (this.clocks.length === 1) {
        return arguments[1];
    }
    if ((this.clocks.length === 0) || this.isSparse()) {
        return null;
    }

    var merged = new VectorClock();
    var isUnified = _.all(this.clocks, function(clock) {
        return _.all(clock.keys, function(value, key) {
            if (merged.has(key) && (merged.get(key) !== value)) {
                return false;
            }
            merged.keys[key] = value;
            return true;
        }, this);
    }, this);
    return isUnified ? merged : null;
};

VectorClockArray.prototype.isSparse = function() {
    return this.clocks.length !== _.keys(this.clock).length;
};

function JoinRepeater(sources) {
    Repeater.call(this);
    this.values = [];
    this.clocks = new VectorClockArray();
    this.indexOf = {}; // id => index
    _.each(sources, function(source, index) {
        this.indexOf[source.id] = index;
        this.addSource(source);
    }, this);
}

Repeater.beget(JoinRepeater);

JoinRepeater.prototype.onReceive = function(values, clock, source) {
    var index = this.indexOf[source.id];
    this.values[index] = values;
    this.clocks.set(index, clock);
    var merged = this.clocks.merge();
    if (merged === null) {
        // Received arguments have inconsistent clocks. We only emit arrays of
        // values with consistent clocks.
        return;
    }
    this.clock = this.clock.merge(merged);
    this.emitMany(_.flatten(this.values, /*shallow:*/true));
};

// Join the values of several repeaters together. Only when all values are
// present and their clocks represent consistent or orthogonal state will it
// emit an array of values. This function accepts varargs or nested arrays of
// repeaters.
Repeater.join = function(/*repeater, ..., arguments*/) {
    return new JoinRepeater(_.flatten(arguments));
};

// ## `RepeaterProxy`
//
// Sometimes it is helpful to have named indirection between `Repeater`s. Using
// a proxy, the order of creation of repeaters doesn't matter because named
// placeholders are used.
/* */

// Create a new `RepeaterProxy`.
//
//     return := this
function RepeaterProxy() {
    this.repeaters = {};
}

// Replay received arguments exactly. Unlike most repeaters, this repeater does
// not emit clocks representing its own state. It exists merely as a proxy.
function ReplayRepeater() {
    Repeater.call(this);
}

Repeater.beget(ReplayRepeater);

ReplayRepeater.prototype.onReceive = function(values, clock, source) {
    this.onEmit.fireWith(source, arguments);
};

// Get a named repeater. Create one, if necessary.
//
//     name := String
//     return := Repeater
RepeaterProxy.prototype.get = function(name) {
    if (this.repeaters.hasOwnProperty(name)) {
        return this.repeaters[name];
    }
    var repeater = this.repeaters[name] = new ReplayRepeater();
    return repeater;
};

// Resolve a varargs or arraylike list of names to repeaters.
RepeaterProxy.prototype.getMany = function(/*name, ... || [name, ...]*/) {
    return _
        .chain(arguments)
        .flatten(/*shallow:*/true)
        .map(this.get, this)
        .value();
};

// Set the source for a named repeater. Although multiple sources can be added,
// this is not expected to be useful.
RepeaterProxy.prototype.set = function(name, repeater) {
    this.get(name).addSource(repeater);
    return this;
};

// Set many repeaters in arbitrary order from a object mapping names to
// repeaters.
RepeaterProxy.prototype.setMany = function(repeaters) {
    _.each(repeaters, function(repeater, name) {
        this.set(name, repeater);
    }, this);
    return this;
};

// ### class methods

RepeaterProxy.create = create;

// Export.
this.repeater = (function(global, repeater, oldRepeater) {
    repeater.VectorClock   = VectorClock;
    repeater.Repeater      = Repeater;
    repeater.RepeaterProxy = RepeaterProxy;
    repeater.noConflict    = function() {
        global.repeater = oldRepeater;
        return repeater;
    };

    return repeater;
})(this, {}, this.repeater);

// ## jQuery extension
var $window = $(window),
    $document = $(document);

function JQueryRepeater($elements, onArgs) {
    Repeater.call(this);
    this.$elements = $elements;
    var args = _.toArray(onArgs);
    args.push(_.bind(function() {
        this.emitArray(arguments);
    }, this));
    $elements.on.apply($elements, args);
    this.onCancel.add(function() {
        $elements.off.apply($elements, args);
    });
}

Repeater.beget(JQueryRepeater);

// Convert an event handler to a repeater. Arguments to `$.fn.on` are
// expected, but without the callback.
$.fn.toRepeater = function() {
    return new JQueryRepeater(this, arguments);
};

var resizeRepeater = _.once(function() {
    return $window.toRepeater('resize');
});

$.repeater = {};

// Emit window size as a repeater. Size is measured immediately and then on all
// `resize` events.
$.repeater.windowSize = _.once(function() {
    var measure = function() {
        return {'width': $window.width(), 'height': $window.height()};
    };
    return resizeRepeater()
        .map(measure)
        .emit(measure());
});

// Emit document size as a repeater. Size is measured immediately and then on
// all `resize` events.
$.repeater.documentSize = _.once(function() {
    var measure = function() {
        return {'width': $document.width(), 'height': $document.height()};
    };
    return resizeRepeater()
        .map(measure)
        .emit(measure());
});
