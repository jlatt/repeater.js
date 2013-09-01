// Create a new instance of a class.
function create() {
    var Cons = this;
    return new Cons();
}

// Inherit from a class, prototypically.
//
//     Constructor, this := Function
function beget(Constructor) {
    function Heir() {}
    Heir.prototype = this.prototype;
    Constructor.prototype = new Heir();
    Constructor.prototype.constructor = Constructor;
    Constructor.beget = beget;
    return Constructor;
}

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

Repeater.beget = beget;

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

Repeater.prototype.onReceive = function(values, clock) {
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

// map

function MapRepeater(source, map) {
    Repeater.call(this, source);
    this.map = map;
}

Repeater.beget(MapRepeater);

MapRepeater.prototype.onReceive = function(values, clock) {
    var value = this.map.apply(this, values);
    Repeater.prototype.onReceive.call(this, [value], clock);
};

//     map := function(Value, ...) { } Value
Repeater.prototype.map = function(map) {
    return new MapRepeater(this, map);
};

// unique

function UniqueRepeater(source) {
    Repeater.call(this, source);
}

Repeater.beget(UniqueRepeater);

UniqueRepeater.prototype.values = null;

UniqueRepeater.prototype.onReceive = function(values, clock) {
    this.clock = this.clock.merge(clock);
    if (!_.isEqual(this.values, values)) {
        this.values = values;
    }
    this.emitMany(this.values);
};

Repeater.prototype.unique = function() {
    return new UniqueRepeater(this);
};

// filter

function FilterRepeater(source, filter) {
    Repeater.call(this, source);
    this.filter = filter;
}

Repeater.beget(FilterRepeater);

FilterRepeater.prototype.onReceive = function(values) {
    if (!this.filter.apply(this, values)) {
        return;
    }
    Repeater.prototype.onReceive.apply(this, arguments);
};

Repeater.prototype.filter = function(filter) {
    return new FilterRepeater(this, filter);
};

function ChainPromise() {}

ChainPromise.prototype.current = $.Deferred().resolve().promise();

ChainPromise.prototype.apply = function(context, values) {
    var previous = this.current;
    var current = this.current = values[0];
    function after() {
        return current;
    }
    return previous.then(after, after);
};

Repeater.prototype.chainPromise = function() {
    return this.map(new ChainPromise());
};

function UnPromise(source) {
    Repeater.call(this, source);
}

Repeater.beget(UnPromise);

UnPromise.prototype.onReceive = function(values, clock, source) {
    var promise = this.current = values[0];
    promise.then(_.bind(function() {
        this.onResolve(promise, [arguments, clock, source]);
    }, this));
};

UnPromise.prototype.onResolve = function(promise, receiveArgs) {
    if (this.current !== promise) {
        return;
    }
    Repeater.prototype.onReceive.apply(this, receiveArgs);
};

Repeater.prototype.unpromise = function() {
    return new UnPromise(this);
};

function AbortPromise() {}

AbortPromise.prototype.current = $.Deferred().resolve().promise();

AbortPromise.prototype.apply = function(context, values) {
    var previous = this.current;
    var promise = this.current = values[0];
    if (_.isFunction(previous.abort)) {
        try {
            previous.abort();
        } catch (ex) {}
    }
    return promise;
};

Repeater.prototype.abortPromise = function() {
    return this.map(new AbortPromise());
};

// ### class methods

Repeater.create = create;

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

Repeater.join = function(/*repeater, ...*/) {
    return new JoinRepeater(arguments);
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
