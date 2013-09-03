// Create a new instance of a class.
function create() {
    /* jshint newcap:false */
    return new this();
}

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
//     Key := String
//     Count := Number, int >= 0
/**/

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

// Return a vector clock that follows only a specific key from the current
// clock.
//
//     key := Key
//     return := VectorClock
VectorClock.prototype.next = function(key) {
    var next = new VectorClock();
    next.keys[key] = this.get(key) + 1;
    return next;
};

VectorClock.prototype.merge = function(clock) {
    var outgoing = new VectorClock();
    _.each([this, clock], function(incoming) {
        _.each(incoming.keys, function(value, key) {
            outgoing.keys[key] = Math.max(outgoing.get(key), value);
        }, this);
    }, this);
    return outgoing;
};

VectorClock.fromJSON = function(obj) {
    var vc = new VectorClock();
    _.extend(vc.keys, obj);
    return vc;
};

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

Repeater.prototype.clock = new VectorClock();

Repeater.prototype.idSequence = {
    'current': 0,

    'next': function() {
        var next = this.current;
        this.current += 1;
        return next;
    }
};

Repeater.prototype.cancel = function() {
    this.onEmit
        .disable()
        .empty();
    this.onCancel
        .fire(this, [this])
        .empty();
    return this;
};

Repeater.prototype.emit = function(/*value, ...*/) {
    return this.emitMany(arguments);
};

Repeater.prototype.emitMany = function(values) {
    this.clock = this.clock
        .next(this.id)
        .merge(this.clock);
    this.onEmit.fireWith(this, [values, this.clock, this]);
    return this;
};

Repeater.prototype.onReceive = function(values, clock/*, source*/) {
    this.clock = this.clock.merge(clock);
    this.emitMany(values);
};

Repeater.prototype.addSource = function(source) {
    this.onCancel.add(function() {
        source.onEmit.remove(this.onReceive);
    });
    source.onEmit.add(this.onReceive);
    return this;
};

Repeater.prototype.hasSource = function(source) {
    return source.onEmit.has(this.onReceive);
};

// map

function MapRepeater(source, mapFunc) {
    Repeater.call(this, source);
    this.mapFunc = mapFunc;
}

Repeater.beget(MapRepeater);

MapRepeater.prototype.onReceive = function(values, clock) {
    var value = this.mapFunc.apply(this, values);
    Repeater.prototype.onReceive.call(this, [value], clock);
};

//     map := function(Value, ...) { } Value
Repeater.prototype.map = function(map) {
    return new MapRepeater(this, map);
};

// filter

function FilterRepeater(source, filterFunc) {
    Repeater.call(this, source);
    this.filterFunc = filterFunc;
}

Repeater.beget(FilterRepeater);

FilterRepeater.prototype.onReceive = function(values) {
    if (this.filterFunc.apply(this, values)) {
        Repeater.prototype.onReceive.apply(this, arguments);
    }
};

Repeater.prototype.filter = function(filter) {
    return new FilterRepeater(this, filter);
};

// unique

function UniqueFilter() {}

FunctionLike.beget(UniqueFilter);

UniqueFilter.prototype.values = null;

UniqueFilter.prototype.run = function() {
    var equal = this.valuesEqual(arguments);
    if (!equal) {
        this.values = arguments;
    }
    return !equal;
};

UniqueFilter.prototype.valuesEqual = function(values) {
    if (this.values === null) {
        return false;
    }
    if (this.values.length !== values.length) {
        return false;
    }
    for (var i = 0, len = values.length; i < len; i += 1) {
        if (!_.isEqual(this.values[i], values[i])) {
            return false;
        }
    }
    return true;
};

Repeater.prototype.unique = function() {
    return this.filter(new UniqueFilter());
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

Repeater.prototype.lastPromise = function() {
    return new LastPromiseRepeater(this);
};

function UnPromise(source) {
    Repeater.call(this, source);
}

Repeater.beget(UnPromise);

UnPromise.prototype.onReceive = function(values, clock) {
    values[0].then(_.bind(function() {
        Repeater.prototype.onReceive.call(this, arguments, clock);
    }, this));
};

// Unwrap resolved promise containers into values. No order is guaranteed. To
// impose order, call this function on a repeater chain with `chainPromise` or
// `lastPromise`.
Repeater.prototype.unpromise = function() {
    return new UnPromise(this);
};

function AbortPreviousPromise() {}

AbortPreviousPromise.prototype.current = null;

AbortPreviousPromise.prototype.apply = function(context, values) {
    var previous = this.current;
    var promise = this.current = values[0];
    if (!_.isNull(previous) && _.isFunction(previous.abort)) {
        try {
            previous.abort();
        } catch (ex) {}
    }
    return promise;
};

// When receiving a new promise, attempt to abort the previous promise in
// progress. This map is useful when promises represent idempotent actions, such
// as an HTTP GET.
Repeater.prototype.abortPreviousPromise = function() {
    return this.map(new AbortPreviousPromise());
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
// present and their clocks represent consistent, orthogonal state will it emit
// an array of values. This function accepts varargs or nested arrays of
// repeaters.
Repeater.join = function(/*repeater, ..., arguments*/) {
    return new JoinRepeater(_.flatten(arguments));
};

// ## `RepeaterProxy`
//
// Sometimes it is helpful to have named indirection between `Repeater`s. Using
// a proxy, the order of creation of repeaters doesn't matter because named
// placeholders are used.


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

RepeaterProxy.prototype.getMany = function(/*name, ...*/) {
    return _
        .chain(arguments)
        .flatten(/*shallow:*/true)
        .map(this.get, this)
        .value();
};

RepeaterProxy.prototype.set = function(name, repeater) {
    this.get(name).addSource(repeater);
    return this;
};

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
    repeater.noConflict    = _.once(function() {
        global.repeater = oldRepeater;
        return repeater;
    });

    return repeater;
})(this, {}, this.repeater);

// ## jQuery extension

$.fn.toRepeater = function() {
    // TODO class-ify
    var $elements = this;
    var args = _.toArray(arguments);
    var repeater = Repeater.create();
    args.push(function() {
        repeater.emitMany(arguments);
    });
    $elements.on.apply($elements, args);
    repeater.onCancel.add(function() {
        $elements.off.apply($elements, args);
    });
    return repeater;
};

$.repeater = {};

$.repeater.windowSize = function() {
    var $window = $(window);
    var measure = function() {
        return {'width': $window.width(), 'height': $window.height()};
    };
    var repeater = $window.toRepeater('resize').map(measure);
    repeater.emit(measure());
    return repeater;
};
