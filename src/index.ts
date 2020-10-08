import { v4 as uuid }    from 'uuid';
import { isConstructor } from 'cqes-util';
import { inspect }       from 'util';

// TODO:
//  > Add Range Type: 5-10, 5 or more, 10 or less, not between 5-10
//  > Handle Recursive Sum Types

const _tag      = Symbol('cqes-type');

export const _Boolean  = globalThis.Boolean;
export const _Number   = globalThis.Number;
export const _String   = globalThis.String;
export const _Function = globalThis.Function;
export const _Object   = globalThis.Object;
export const _Date     = globalThis.Date;
export const _Set      = globalThis.Set;
export const _Array    = globalThis.Array;
export const _Map      = globalThis.Map;

export type Typer     = { from(data: any): Typed, name: string };
export type Typed     = any;

export class TypeError extends Error {
  static sep = '\n       ';
  constructor(message: string, parentError?: Error) {
    if (parentError) {
      super(message + TypeError.sep + _String(parentError).substr(7));
    } else {
      super(message);
    }
  }
}

export type rewriter<T>   = (this: T, a: any) => any;
export type predicate<T>  = (this: T, a: any) => boolean;
export type assertion<T>  = (this: T, a: any) => void;
export type constraint<T> = RegExp | predicate<T> | assertion<T>;
export type parser<T>     = (this: T, a: any)       => any | void;
export type warn          = (error: Error)          => void;
export type filler        = (input: any)            => any;

const makeConstructor = (name: string) => {
  if (!/^[a-z$_][a-z0-9$_]*$/i.test(name)) throw new Error('Bad name');
  return eval
  ( [ '(function ' + name + '() {'
    , '  if (this instanceof ' + name + ') return this;'
    , '  return ' + name + '.of.apply(' + name + ', arguments);'
    , '})'
    ].join('\n')
  );
}

const makeCollectionConstructor = (name: string, collection: Function) => {
  if (!/^[a-z$_][a-z0-9$_]*$/i.test(name)) throw new Error('Bad name');
  return eval
  ( [ '(function (Collection) {'
    , '  return class ' + name + ' extends Collection {};'
    , '})'
    ].join('\n')
  )(collection);
};

const fnHasNativeProps = _Object.getOwnPropertyNames(function () {}).reduce((result, key) => {
  result[key] = true;
  return result;
}, {});

const tagCQESType = (Type: any) => {
  _Object.defineProperty(Type, _tag, { value: true, enumerable: false, writable: false });
}

export function isType(Type: any): Type is Typer {
  return !!(Type && Type[_tag]);
}

const toStringMethodProperty = { configurable: true, writable: true, enumerable: false, value: function () {
  if (this.constructor.toString !== _Object.prototype.toString) return this.constructor.toString(this);
  return _Object.prototype.toString.call(this);
} };


// Value
export interface IValue<A = any> {
  (...types: any[]):  this;
  new ():             A;

  _default:     () => A;
  _rewriters:   Array<any>;
  _parsers:     Array<any>;
  _assertions:  Array<any>;
  _cache:       Map<string, IValue<A>>;
  _debug:       boolean;

  defineProperty(name: string, value: any, isGetter?: boolean): void;

  debug<T>(this: T):                                                     T;
  extends<T>(this: T, name: string):                                     T;
  clone<T>(this: T, fn?: (type: T) => void):                             T;
  of<T>(this: T, ...a: any[]):                                           T;
  setProperty<T>(this: T, name: string, value: any, isGetter?: boolean): T;
  addRewriter<T>(this: T, rewriter: rewriter<T>):                        T;
  addConstraint<T>(this: T, fn: constraint<T>):                          T;
  addParser<T>(this: T, fn: parser<T>):                                  T;
  setDefault<T>(this: T, fn: any):                                       T;
  mayNull:                                                               this;

  from<X>(this: new (input?: A) => X, data: A, warn?: warn): X;
  compare(from: any, to: any): number;
  walk<X>(this: new (x?: A) => X, data: X, iter: string, key?: any, ...args: Array<any>): X;
}

export const Value = <IValue><unknown>function Value() {};

tagCQESType(Value);

Value.defineProperty = function defineProperty(name: string, value: any, isGetter?: boolean) {
  if (isGetter) {
    if (typeof value === 'function' && value.length === 0) {
      const indirection = '__get_' + name;
      _Object.defineProperty(this, indirection, { value, enumerable: true, writable: true });
      if (!(name in this)) {
        _Object.defineProperty(this, name, { get: function () {
          if (this._cache != null) {
            const cached = this._cache.get(name);
            if (cached != null) return cached;
            const value = this[indirection]();
            this._cache.set(name, value);
            return value;
          } else {
            return this[indirection]();
          }
        }, enumerable: true });
      }
    } else {
      throw new Error('Getters must be function without argument');
    }
  } else {
    _Object.defineProperty(this, name, { value, enumerable: true, writable: true });
  }
};

Value.defineProperty('_debug',      false);
Value.defineProperty('_rewriters',  new _Array());
Value.defineProperty('_parsers',    new _Array());
Value.defineProperty('_assertions', new _Array());

Value.defineProperty('debug', function debug() {
  debugger;
  return this.clone((type: IValue) => {
    type._debug = true;
  });
});

Value.defineProperty('type', function type() {
  return this;
});

Value.defineProperty('extends', function extend(name: string) {
  const value = makeConstructor(name);
  tagCQESType(value);
  let parent = this;
  while (parent != null) {
    if (parent.hasOwnProperty(_tag)) break ;
    parent = _Object.getPrototypeOf(parent);
  }
  if (parent == null) throw new Error('Must be a CQES/Type');
  const props = [].concat(_Object.getOwnPropertyNames(this), _Object.getOwnPropertyNames(parent));
  for (let key of props) {
    if (fnHasNativeProps[key]) continue ;
    switch (key) {
    case '_cache': { value._cache = new _Map(); } break ;
    default: {
      const property = _Object.getOwnPropertyDescriptor(parent, key)
                    || _Object.getOwnPropertyDescriptor(this, key);
      if (property == null) continue ;
      if ('value' in property) {
        switch (_Object.prototype.toString.call(property.value)) {
        case '[object Array]': { value[key] = _Array.from(property.value); } break ;
        case '[object Set]':   { value[key] = new _Set(property.value); } break ;
        case '[object Map]':   { value[key] = new _Map(property.value); } break ;
        default: { _Object.defineProperty(value, key, property); } break ;
        }
      } else {
        _Object.defineProperty(value, key, property);
      }
    } break ;
    }
  }
  return value;
});

Value.defineProperty('clone', function clone(modifier?: (a: any) => any) {
  const value = this.extends(this.name);
  if (modifier) modifier.call(null, value);
  return value;
});

Value.defineProperty('of', function of(model?: any, ...rest: any[]) {
  if (model && model[_tag]) return model;
  if (isConstructor(model)) throw new Error(model.name + ' is not a valid type, forgot an import ?');
  throw new Error('Value can not hold value');
});

Value.defineProperty('setProperty', function setProperty(name: string, value: any, isGetter?: boolean) {
  return this.clone((type: IValue) => {
    type.defineProperty(name, value, isGetter);
  });
});

Value.defineProperty('setDefault', function setDefault(defaultValue: any) {
  return this.clone((type: IValue) => {
    if (isType(defaultValue)) {
      type._default = () => (<IValue>defaultValue)._default();
    } else if (isConstructor(defaultValue)) {
      type._default = () => new defaultValue();
    } else if (typeof defaultValue === 'function') {
      type._default = defaultValue;
    } else {
      type._default = () => defaultValue;
    }
  });
});

Value.defineProperty('mayNull', function mayNull() {
  return this.setDefault(null);
}, true);

Value.defineProperty('addRewriter', function rewrite<T>(rewriter: rewriter<T>) {
  if (rewriter == null) throw new Error('Require a function');
  return this.clone((type: IValue) => {
    type._rewriters.push(rewriter);
  });
});

Value.defineProperty('addParser', function addParser<T>(parser: parser<T>) {
  if (parser == null) throw new Error('Require a function');
  return this.clone((value: IValue) => value._parsers.unshift(parser));
});

Value.defineProperty('addConstraint', function addConstraint<T>(constraint: constraint<T>) {
  if (constraint == null) throw new Error('Require a defined constraint');
  return this.clone((value: IValue) => {
    if (typeof constraint === 'function')
      value._assertions.push(constraint);
    else if (constraint instanceof RegExp)
      value._assertions.push((value: any) => {
        constraint.lastIndex = 0;
        const result = constraint.test(value);
        if (result === false)
          throw new TypeError('Constraint ' + constraint + ' not satisfied');
      });
    else
      value._assertions.push((value: any) => {
        const result = constraint === value;
        if (result === false)
          throw new TypeError('Constraint (=== ' + constraint + ') not satisfied')
      });
  });
});

Value.defineProperty('from', function from(value: any, warn?: warn) {
  if (this._debug) debugger;
  if (value instanceof this) return value;
  for (let i = 0; i < this._rewriters.length; i += 1)
    value = this._rewriters[i].call(this, value);
  if (value == null) {
    if (this._default != null) value = this._default();
    else throw new TypeError('Mandatory value is missing');
    if (value === null) return null;
  }
  try {
    for (let i = 0; i < this._parsers.length; i += 1) {
      const result = this._parsers[i].call(this, value, warn);
      if (result == null) continue ;
      value = result;
      break ;
    }
    for (let i = 0; i < this._assertions.length; i += 1)
      if (this._assertions[i].call(this, value) === false)
        throw new Error(this._assertions[i].name + ' not satisfied');
  } catch (e) {
    if (this._default == null) throw e;
    else if (warn != null) warn(e);
    const message = e.toString().split('\n').pop().substr(7);
    value = this._default();
  }
  return value;
});

Value.defineProperty('compare', function compare(from: any, to: any) {
  if (from === to) return 0;
  if (from == null && to == null) return 0;
  if (typeof from === 'number' && typeof to === 'number')
    if (isNaN(from) && isNaN(to)) return 0;
  return 1;
});

Value.defineProperty('walk', function walk<A>(data: A, iter: string, key: any, ...args: Array<any>): A {
  if (typeof this[iter] === 'function') {
    const value = this[iter].call(this, data, args[0], key, ...args.slice(1));
    if (value !== undefined && value != data) data = value;
  }
  if (typeof this[iter + '_after'] === 'function') {
    const value = this[iter + '_after'].call(this, data, args[0], key, ...args.slice(1));
    if (value !== undefined && value != data) data = value;
  }
  return data;
});

// Boolean
export interface IBoolean extends IValue<Boolean> {
  _true:  Set<string>;
  _false: Set<string>;
}

export const Boolean = (<IBoolean>Value.extends('Boolean'))
  .setProperty('_true', new _Set(['1', 'y', 'yes', 'true', 'on']))
  .setProperty('_false', new _Set(['', '0', 'n', 'no', 'false', 'off']))
  .addParser(function (value: string) {
    if (typeof value !== 'string') return ;
    if (this._true.has(value.toLowerCase())) return true;
    if (this._false.has(value.toLowerCase())) return false;
  })
  .addParser((value: number) => {
    if (typeof value !== 'number') return ;
    return !(isNaN(value) || value === 0);
  })
  .addConstraint((v: any) => {
    if (v !== !!v) throw new TypeError('Require a Boolean');
  });

// Number
export interface INumber extends IValue<Number> {
  between<T>(this: T, min: number, max: number): T;
  greater<T>(this: T, limit: number): T;
  lesser<T>(this: T, limit: number): T;
  positive: this;
  integer:  this;
  natural:  this;
}

export const Number = (<INumber>Value.extends('Number'))
  .setProperty('between', function between(min: number, max: number) {
    return this.addConstraint(function isBetween(value: number) {
      return value >= min && value <= max;
    });
  })
  .setProperty('lesser', function lesser(limit: number) {
    return this.addConstraint(function lesserThan(value: number) {
      return value < limit;
    });
  })
  .setProperty('greater', function greater(limit: number) {
    return this.addConstraint(function greaterThan(value: number) {
      return value > limit;
    });
  })
  .setProperty('positive', function positive() {
    return this.addConstraint(function isPositive(value: number) {
      return value >= 0;
    });
  }, true)
  .setProperty('integer', function integer() {
    return this.addConstraint(function isInteger(value: number) {
      return isFinite(value) && value === Math.floor(value);
    }).addParser(function (input: any) {
      return Math.floor(input);
    });
  }, true)
  .setProperty('natural', function natural() {
    return this.positive.integer;
  }, true)
  .addParser(function parseNumber(value: string) {
    if (typeof value !== 'string') return ;
    return parseFloat(value);
  })
  .addConstraint(function isNumber(value: number) {
    if (typeof value !== 'number') throw new TypeError('Require a Number');
    if (isNaN(value)) throw new TypeError('Number is NaN');
  });

// String
export interface IString extends IValue<String> {
  notEmpty: this;
  notBlank: this;
}

export const String = (<IString>Value.extends('String'))
  .setProperty('notEmpty', function notEmpty() {
    return this.addConstraint((value: string) => _String(value) !== '');
  }, true)
  .setProperty('notBlank', function notEmpty() {
    return this.addConstraint((value: string) => !/^[\s\n]*$/.test(value));
  }, true)
  .addParser(function parseNative(value: any) {
    switch (typeof value) {
    case 'number': case 'boolean': return _String(value);
    }
  })
  .addConstraint(function isString(value: any) {
    if (typeof value !== 'string') throw new TypeError('Require a String');
  });

// Enum
export interface IEnum extends IValue<String> {
  _iterTests: Array<[(val: any) => boolean, any]>;
  _strTests:  { [key: string]: any };
  _sensitive: boolean;
  _notrim:    boolean;
  strict:     this;
  as<T>(this: T, value: any, ...tests: Array<any>): T;
}

export const Enum = (<IEnum>Value.extends('Enum'))
  .setProperty('_iterTests', [])
  .setProperty('_strTests',  {})
  .setProperty('_sensitive', false)
  .setProperty('_notrim', false)
  .setProperty('strict', function sensitive() {
    return this.clone((type: IEnum) => {
      type._sensitive = true;
      type._notrim = true;
    });
  }, true)
  .setProperty('as', function addCase(...tests: Array<any>) {
    const value = tests[0];
    return this.clone((type: IEnum) => {
      for (const test of tests) {
        switch (typeof test) {
        case 'number': { type._strTests[_String(test)] = value; } break ;
        case 'string': { type._strTests[type._sensitive ? test : test.toLowerCase()] = value; } break ;
        case 'function': { type._iterTests.push([test, value]); } break ;
        default : {
          if (test instanceof RegExp) type._iterTests.push([input => test.test(input), value]);
          else type._iterTests.push([input => input === test, value]);
        } break ;
        }
      }
    })
  })
  .addParser(function parseValue(input: any) {
    let search = input;
    switch (typeof input) {
    case 'number':
      search = _String(search);
    case 'string':
      if (!this._sensitive) search = search.toLowerCase();
      if (!this._notrim) search = search.trim();
    }
    for (const [match, value] of this._iterTests)
      if (match(search))
        return value;
    if (this._strTests[input] != null)
      return this._strTests[input];
    if (search) return input;
    return null;
  });

// Object
export interface IObject extends IValue<{ $: string }> {
  _fields:  Map<string, { type: IValue, postfill?: { filler: filler, enumerable: boolean } }>;

  add<T>(this: T, field: string, type: any):                                    T;
  rewrite<T>(this: T, field: string, predicate: predicate<T>, value: any):      T;
  fixIf<T>(this: T, pattern: string | Function, handler: string | rewriter<T>): T;
  postfill<T>(this: T, field: string, filler: filler, enumerable?: boolean):    T;
}

export const Object = (<IObject>Value.extends('Object'))
  .setProperty('_fields', new _Map())
  .setProperty('of', function of(model: { [name: string]: any }) {
    const object = this.clone();
    for (const field in model) {
      if (model[field] instanceof _Array)
        object._fields.set(field, { type: Value.of(...model[field]) });
      else
        object._fields.set(field, { type: Value.of(model[field]) });
    }
    return object;
  })
  .setProperty('compare', function compare(from: any, to: any) {
    let diff = 0;
    for (const [name, { type }] of this._fields)
      diff += type.compare(from && from[name], to && to[name]);
    return diff;
  })
  .setProperty('walk', function walk<A>(data: A, iter: string, key: any, ...args: Array<any>): A {
    if (typeof this[iter] === 'function') {
      const value = this[iter].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    if (data == null) return null;
    data = { $: this.name, ...data };
    for (const [name, { type }] of this._fields)
      data[name] = type.walk(data[name], iter, name, ...args);
    if (typeof this[iter + '_after'] === 'function') {
      const value = this[iter + '_after'].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    return data;
  })
  .setProperty('add', function add(field: string, type: any) {
    return this.clone((object: IObject) => {
      object._fields.set(field, { type: Value.of(type) });
    });
  })
  .setProperty('rewrite', function rewrite(field: string, predicate: any, value: any) {
    return this.addRewriter((object: any) => {
      if (object && predicate(object[field]))
        object[field] = value;
      return object;
    });
  })
  .setProperty('fixIf', function fixIf<T>(pattern: string | Function, handler: string | rewriter<T>) {
    if (typeof pattern !== 'function') {
      const key = pattern;
      pattern = (value: any) =>
        ( Object.prototype.toString.call(value) === '[object ' + key + ']'
       || (value && value.$ === key)
        );
    }
    if (typeof handler !== 'function') {
      const key = handler;
      handler = (input: any) => ({ [key]: input });
    }
    return this.addRewriter((input: any) => (<Function>pattern)(input) ? (<Function>handler)(input) : input);
  })
  .setProperty('postfill', function postfill(field: string, filler: filler, enumerable?: boolean) {
    return this.clone((object: IObject) => {
      const child = object._fields.get(field);
      if (child == null) throw new Error('Require field: ' + field + ' to be already defined');
      object._fields.set(field, { ...child, postfill: { filler, enumerable } });
    });
  })
  .addParser(function parseObject(data: any, warn?: warn) {
    const result = new this();
    _Object.defineProperty(result, 'toString', toStringMethodProperty);
    result.$ = this.name;
    const fillers = <{ [name: string]: { type: IValue, postfill: filler, enumerable: boolean } }>{};
    for (const [name, { type, postfill }] of this._fields) {
      try {
        result[name] = type.from(data[name], warn);
        if (result[name] == null && postfill != null)
          fillers[name] = { type, postfill: postfill.filler, enumerable: !!postfill.enumerable };
      } catch (e) {
        if (postfill != null) continue ;
        const strval = JSON.stringify(data[name]);
        throw new TypeError('Failed on field: ' + name + ' = ' + strval, e);
      }
    }
    for (const name in fillers) {
      const { type, postfill, enumerable } = fillers[name];
      let value = null;
      try {
        value = postfill.call(this, result);
        value = type.from(value, warn);
        if (value != null) _Object.defineProperty(result, name, { value, enumerable, writable: true });
      } catch (e) {
        const strval = JSON.stringify(value);
        throw new TypeError('Failed on field: ' + name + ' = ' + strval, e);
      }
    }
    return result;
  })
  .addConstraint(function isObject(data: any) {
    if (typeof data != 'object') throw new TypeError('Require an object');
  });

// Sum
export interface ISum extends IValue<{ $: string }> {
  _cases:        Map<string, IObject>;
  _defaultCase?: IValue;
  mayEmpty:      this;
  either<T>(this: T, name: string, type: any): T;
}

export const Sum = (<ISum>Value.extends('Sum'))
  .setProperty('_cases', new _Map())
  .setProperty('either', function either(name: string, casetype: IObject) {
    if (this._cases.has(name)) throw new Error('this case already exists');
    return this.clone((type: ISum) => {
      type._cases.set(name, casetype)
    });
  })
  .setProperty('mayEmpty', function mayEmpty() {
    return this.setDefault(() => new class Undefined {});
  }, true)
  .setProperty('compare', function compare(from: any, to: any) {
    if (to && to.$) return this._cases.get(to.$).compare(from, to);
    return 1;
  })
  .setProperty('walk', function walk<A>(data: any, iter: string, key: any, ...args: Array<any>): A {
    if (data == null) data = <any>({ $: null });
    if (typeof this[iter] === 'function') {
      const value = this[iter].call(this, data.$, args[0], key, ...args.slice(1));
      if (typeof value === 'string') data.$ = value;
    }
    if (this._cases.has(data.$) && typeof data.$ === 'string') {
      const value = this._cases.get(data.$).walk(data, iter, key, ...args);
      if (value !== undefined && value != data) data = value;
    }
    if (typeof this[iter + '_after'] === 'function') {
      const value = this[iter + '_after'].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    if (data.$ != null) return data;
    return null;
  })
  .addParser(function parseValue(value: any, warn?: warn) {
    if (typeof value === 'object' && this._cases.has(value.$)) {
      return this._cases.get(value.$).from(value, warn);
    } else if (this._defaultCase != null) {
      return this._defaultCase.from(value, warn);
    }
    return null;
  });

// Collection
export interface ICollection<A> extends IValue<A> {
  notEmpty: this;
}

export const Collection = (<ICollection<any>>Value.extends('Collection'))
  .setProperty('notEmpty', function notEmpty() {
    throw new Error('Not implemented');
  }, true)
;

// Set
export interface ISet extends ICollection<Set<any>> {
  _constructor: { new (): Set<any> };
  _subtype: IValue;
  from<X>(this: new () => X, data: Set<any> | Array<any>, warn?: warn): X;
  has(source: Set<any>, value: any): boolean;
  compare(from: Set<any>, to: Set<any>): number;
  toJSON: (this: Set<any>) => any;
}

export const Set = (<ISet>Collection.extends('Set'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Set);
  }, true)
  .setProperty('_subtype', null)
  .setProperty('of', function (type: any) {
    return this.clone((value: ISet) => value._subtype = Value.of(type));
  })
  .setProperty('toJSON', function toJSON() {
    return _Array.from(this);
  })
  .setDefault(function () {
    const set = new _Set();
    _Object.defineProperty(set, 'toJSON', { value: this.toJSON });
    return set;
  })
  .setProperty('notEmpty', function notEmpty() {
    return this.addConstraint(function notEmpty(value: any) {
      return value.size > 0;
    });
  }, true)
  .setProperty('has', function has(source: Set<any>, value: any) {
    if (source.has(value)) return true;
    for (const item of source) {
      if (this._subtype.diff(value, item)) continue ;
      return true;
    }
    return false;
  })
  .setProperty('compare', function compare(from: any, to: any) {
    let diff = 0;
    if (from) {
      for (const item of from) {
        if (this.has(to, item)) continue ;
        diff += this._subtype.compare(item, null);
      }
    }
    if (to) {
      for (const item of to) {
        if (this.has(from, item)) continue ;
        diff += this._subtype.compare(null, item);
      }
    }
    return diff;
  })
  .setProperty('walk', function walk<A>(data: any, iterator: string, key: any, ...args: Array<any>): A {
    if (data == null) return null;
    const copy = new _Set(data || []);
    data.clear();
    let i = 0;
    for (const item of copy) {
      data.add(this._subtype.walk(item, iterator, i, ...args));
      i += 1;
    }
    return data;
  })
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array || data instanceof _Set)) return ;
    const set = new this._constructor();
    for (const value of data)
      set.add(this._subtype.from(value, warn));
    _Object.defineProperty(set, 'toJSON', { value: this.toJSON });
    return set;
  })
  .addConstraint(function isSet(data: any) {
    if (!(data instanceof _Set)) throw new TypeError('Require a Set');
  })
;

// Array
export interface IArray extends ICollection<Array<any>> {
  _constructor: { new (): Array<any> };
  _subtype: IValue;
  compare(from: Array<any>, to: Array<any>): number;
}

export const Array = (<IArray>Collection.extends('Array'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Array);
  }, true)
  .setProperty('_subtype', null)
  .setProperty('_default', function () {
    return new _Array();
  })
  .setProperty('of', function (type: any) {
    return this.clone((value: IArray) => value._subtype = Value.of(type));
  })
  .setProperty('notEmpty', function notEmpty() {
    return this.addConstraint(function notEmpty(value: any) {
      return value.length > 0;
    });
  }, true)
  .setProperty('compare', function compare(from: any, to: any) {
    const length = Math.max(from.length, to.length);
    let diff = 0;
    for (let i = 0; i < length; i += 1)
      diff += this._subtype.compare(from[i], to[i]);
    return diff;
  })
  .setProperty('walk', function walk<A>(data: any, iterator: string, key: any, ...args: Array<any>): A {
    if (data == null) return null;
    for (let i = 0; i < data.length; i += 1)
      data[i] = this._subtype.walk(data[i], iterator, i, ...args);
    return data;
  })
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array)) return ;
    const array = new this._constructor();
    for (let i = 0; i < data.length; i += 1) {
      try { array[i] = this._subtype.from(data[i], warn); }
      catch (e) {
        const strval = JSON.stringify(data[i]);
        throw new TypeError('Failed on index: ' + i + ' = ' + strval, e);
      }
    }
    return array;
  })
  .addConstraint(function isArray(data: any) {
    if (!(data instanceof _Array)) throw new TypeError('Require an Array');
  });


// Map
export interface IMap extends ICollection<Map<any, any>> {
  _constructor: { new (): Map<any, any> };
  _index:   IValue;
  _subtype: IValue;
  toJSON: (this: Map<any, any>) => any;

  compare(from: Map<any, any>, to: Map<any, any>): number;
}

export const Map = (<IMap>Collection.extends('Map'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Map);
  }, true)
  .setProperty('_index', null)
  .setProperty('_subtype', null)
  .setProperty('_default', function () {
    const map = new _Map();
    _Object.defineProperty(map, 'toJSON', { value: this.toJSON });
    return map;
  })
  .setProperty('toJSON', function toJSON() {
    return _Array.from(this);
  })
  .setProperty('notEmpty', function notEmpty() {
    return this.addConstraint((value: any) => {
      return value.size > 0;
    });
  }, true)
  .setProperty('of', function (index: any, type: any) {
    return this.clone((value: IMap) => {
      value._index = Value.of(index);
      value._subtype = Value.of(type);
    });
  })
  .setProperty('get', function get(source: Map<any, any>, key: any) {
    if (source.has(key)) return source.get(key);
    for (const [item, value] of source) {
      if (this._index.diff(key, item)) continue ;
      return value;
    }
    return null;
  })
  .setProperty('compare', function compare(from: any, to: any) {
    const done = new Set();
    let diff = 0;
    if (from) {
      for (const [key, value] of from) {
        const otherValue = this.get(to, key);
        diff += this._subtype.compare(value, otherValue);
        if (otherValue != null) done.add(otherValue);
      }
    }
    if (to) {
      for (const [key, value] of to) {
        if (done.has(value)) continue ;
        diff += this._subtype.compare(null, value);
      }
    }
    return diff;
  })
  .setProperty('walk', function walk<A>(data: any, iterator: string, key: any, ...args: Array<any>): A {
    if (data == null) return null;
    for (const [key, value] of data)
      data.set(key, this._subtype.walk(value, iterator, key, ...args));
    return data;
  })
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array || data instanceof _Map)) return ;
    const map = new this._constructor();
    for (const [key, value] of data) {
      try { map.set(this._index.from(key, warn), this._subtype.from(value, warn)); }
      catch (e) {
        const strkey = JSON.stringify(key);
        const strval = JSON.stringify(value);
        throw new TypeError('Failed on ' + strkey + ' = ' + strval, e);
      }
    }
    _Object.defineProperty(map, 'toJSON', { value: this.toJSON });
    return map;
  })
  .addConstraint(function isMap(data: any) {
    if (!(data instanceof _Map)) throw new TypeError('Require a Map');
  });

// Tuple
export interface ITuple extends ICollection<any[]> {
  _constructor: { new (): any[] };
  _types: Array<IValue>;
  compare(from: any[], to: any[]): number;
}

export const Tuple = (<ITuple>Collection.extends('Tuple'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Array);
  }, true)
  .setProperty('_types', new _Array())
  .setProperty('of', function (...types: Array<any>) {
    return this.clone((value: ITuple) => {
      value._types = types.map(T => Value.of(T));
    });
  })
  .setProperty('compare', function compare(from: any, to: any) {
    throw new Error('TODO: Implement me');
  })
  .setProperty('walk', function walk<A>(data: A, iter: string, key: any, ...args: Array<any>): A {
    if (typeof this[iter] === 'function') {
      const value = this[iter].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    if (data == null) return null;
    for (let i = 0; i < this._types.length; i += 1) {
      const result = this._types[i].walk(data[i], iter, i, ...args);
      if (result === undefined) continue ;
      data[i] = result;
    }
    if (typeof this[iter + '_after'] === 'function') {
      const value = this[iter + '_after'].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    return data;
  })
  .addParser(function parseRecord(data: any, warn?: warn) {
    const result = new _Array(this._types.length);
    if (data == null) data = [];
    for (let i = 0; i < this._types.length; i += 1) {
      try {
        const type = this._types[i];
        const value = type.from(data[i], warn);
        if (value != null) result[i] = value;
      } catch (e) {
        const strval = JSON.stringify(data[i]);
        throw new TypeError('Failed on field: ' + i + ' = ' + strval, e);
      }
    }
    return result;
  })
;

// Record
export interface IRecord extends ICollection<{ [name: string]: any }> {
  _constructor: { new (): { [name: string]: any } };
  _members:  Map<string, { type: IValue, postfill?: { filler: filler, enumerable: boolean } }>;
  mayEmpty: this;
  compare(from: { [name: string]: any }, to: { [name: string]: any }): number;
  add<T>(this: T, field: string, type: any): T;
  remove<T>(this: T, field: string):         T;
  postfill<T>(this: T, field: string, filler: filler, enumerable?: boolean): T;
}

export const Record = (<IRecord>Collection.extends('Record'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Object);
  }, true)
  .setProperty('_members', new _Map())
  .setProperty('mayEmpty', function mayEmpty() {
    return this.setDefault(() => {});
  }, true)
  .setProperty('compare', function compare(from: any, to: any) {
    throw new Error('TODO: Implement me');
  })
  .setProperty('walk', function walk<A>(data: A, iter: string, key: any, ...args: Array<any>): A {
    if (data == null) data = <any>({});
    if (typeof this[iter] === 'function') {
      const value = this[iter].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    for (const [name, { type }] of this._members) {
      const result = type.walk(data[name], iter, name, ...args);
      if (result === undefined) continue ;
      data[name] = result;
    }
    if (typeof this[iter + '_after'] === 'function') {
      const value = this[iter + '_after'].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    // Has any key
    for (const any in data) return data;
    return null;
  })
  .setProperty('add', function add(field: string, type: any) {
    return this.clone((object: IRecord) => {
      object._members.set(field, { type: Value.of(type) });
    });
  })
  .setProperty('remove', function add(field: string) {
    return this.clone((object: IRecord) => {
      object._members.delete(field);
    });
  })
  .setProperty('postfill', function postfill(field: string, filler: filler, enumerable?: boolean) {
    return this.clone((object: IRecord) => {
      const child = object._members.get(field);
      if (child == null) throw new Error('Require field: ' + field + ' to be already defined');
      object._members.set(field, { ...child, postfill: { filler, enumerable } });
    });
  })
  .addParser(function parseRecord(data: any, warn?: warn) {
    const result = new this();
    _Object.defineProperty(result, 'toString', toStringMethodProperty);
    const fillers = <{ [name: string]: { type: IValue, postfill: filler, enumerable: boolean } }>{};
    for (const [name, { type, postfill }] of this._members) {
      try {
        const value = type.from(data[name], warn);
        if (value != null)
          result[name] = value;
        else if (postfill != null)
          fillers[name] = { type, postfill: postfill.filler, enumerable: !!postfill.enumerable };
      } catch (e) {
        if (postfill != null) continue ;
        const strval = JSON.stringify(data[name]);
        throw new TypeError('Failed on field: ' + name + ' = ' + strval, e);
      }
    }
    for (const name in fillers) {
      const { type, postfill, enumerable } = fillers[name];
      let value = null;
      try {
        value = postfill.call(this, result);
        value = type.from(value, warn);
        if (value != null) _Object.defineProperty(result, name, { value, enumerable, writable: true });
      } catch (e) {
        const strval = JSON.stringify(value);
        throw new TypeError('Failed on field: ' + name + ' = ' + strval, e);
      }
    }
    return result;
  })
  .addConstraint(function isObject(data: any) {
    for (const key in data) return ;
    if (this._members.size === 0) return ;
    throw new Error('Empty Record');
  });

// ------------------------------------------
// Extended Types
// ------------------------------------------

// UUID
export interface IUUID extends IString {
  _blank:   string;
  mayBlank: this;
}

export const UUID = (<IUUID>String.extends('UUID'))
  .setProperty('_blank', '00000000-0000-0000-0000-000000000000')
  .setProperty('mayBlank', function () {
    return this.setDefault(this._blank);
  }, true)
  .addConstraint(/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

// Email
export interface IEmail extends IString {}

export const Email = (<IEmail>String.extends('Email'))
  .addConstraint(/^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/);

// URL
export interface IURL extends IString {}

export const URL = (<IURL>String.extends('URL'))
  .addConstraint(/^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:\/?#[\]@!\$&'\(\)\*\+,;=.]+$/)

// Date
export interface IDate extends IString {
  mayToday: this;
}

export const Date = (<IDate>String.extends('Date'))
  .setProperty('mayToday', function mayToday() {
    return this.setDefault(() => new _Date());
  }, true)
  .addParser(function parseDate(value: any) {
    if (!(value instanceof _Date)) return ;
    return value.toISOString().substr(0, 10);
  })
  .addConstraint(function isDate(value: any) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return ;
    throw new TypeError('Invalide Date format');
  });

// Time
export interface ITime extends IString {
  mayNow: this;
}

export const Time = (<ITime>String.extends('Time'))
  .setProperty('mayNow', function mayNow() {
    return this.setDefault(() => new _Date());
  }, true)
  .addParser(function parseDate(value: any) {
    if (!(value instanceof _Date)) return ;
    return value.toISOString().substr(11, 12);
  })
  .addConstraint(function isTime(value: any) {
    if (/^\d{2}-\d{2}-\d{2}(\.\d{3})?(Z|[+\-]\d+)?$/.test(value)) return ;
    throw new TypeError('Invalide Time format');
  });


// DateTime
export interface IDateTime extends IString {
  mayNow: this;
}

export const DateTime = (<IDateTime>Value.extends('DateTime'))
  .setProperty('mayNow', function mayNow() {
    return this.setDefault(() => new _Date());
  }, true)
  .addParser(function parseTimestamp(value: number) {
    if (typeof value !== 'number' || !(value > 0)) return ;
    return new _Date(value);
  })
  .addParser(function parseString(value: string) {
    if (typeof value !== 'string') return ;
    const date = /^\d{4}(-\d\d){2}( |T)(\d\d)(:\d\d){2}(\.\d{3})?(Z|[+\-]\d+)?$/.exec(value);
    return new _Date(value);
  })
  .addConstraint(function isDate(value: Date) {
    if (!(value instanceof _Date)) throw new TypeError('Require a JsDate');
    if (value.toString() === 'Invalid Date') throw new TypeError('Invalid date format');
  });


