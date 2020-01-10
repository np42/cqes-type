import { v4 as uuid }    from 'uuid';
import { isConstructor } from 'cqes-util';
import { inspect }       from 'util';

const _tag      = Symbol('cqes-type');
const _Boolean  = global.Boolean;
const _Number   = global.Number;
const _String   = global.String;
const _Function = global.Function;
const _Object   = global.Object;
const _Date     = global.Date;
const _Set      = global.Set;
const _Array    = global.Array;
const _Map      = global.Map;

export type Typer     = { from(data: any): Typed };
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
export type parser<T>     = (this: T, a: any) => any | void;
export type warn          = (error: Error) => void;

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

const tagCQESType = (Type: any) => {
  _Object.defineProperty(Type, _tag, { value: true, enumerable: false, writable: false });
}

export function isType(Type: any) {
  return !!(Type && Type[_tag]);
}

// Value
export interface IValue<A = any> {
  (...types: Array<any>): this;
  new ():                 A;

  _default:     () => A;
  _rewriters:   Array<any>;
  _parsers:     Array<any>;
  _assertions:  Array<any>;
  _cache:       Map<string, IValue<A>>;
  _debug:       boolean;

  defineProperty(name: string, value: any, isGetter?: boolean): void;

  debug<T>(this: T):                                                     T;
  extends<T>(this: T, name: string):                                     T;
  clone<T>(this: T, fn: (type: T) => void):                              T;
  of<T>(this: T, ...a: any[]):                                           T;
  setProperty<T>(this: T, name: string, value: any, isGetter?: boolean): T;
  addRewriter<T>(this: T, rewriter: rewriter<T>):                        T;
  addConstraint<T>(this: T, fn: constraint<T>):                          T;
  addParser<T>(this: T, fn: parser<T>):                                  T;
  setDefault<T>(this: T, fn: any):                                       T;
  mayNull:                                                               this;

  from<X>(this: new (input?: any) => X, data: any, warn?: warn): X;
}

export const Value = <IValue>function Value() {};

tagCQESType(Value);

Value.defineProperty = function defineProperty(name: string, value: any, isGetter?: boolean) {
  if (isGetter) {
    if (typeof value === 'function' && value.length === 0) {
      const indirection = '__get_' + name;
      _Object.defineProperty(this, indirection, { value, enumerable: true, writable: true });
      if (!(name in this)) {
        _Object.defineProperty(this, name, { get: function () {
          const cached = this._cache.get(name);
          if (cached != null) return cached;
          const value = this[indirection]();
          this._cache.set(name, value);
          return value;
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
Value.defineProperty('_cache',      new _Map());

Value.defineProperty('debug', function debug() {
  debugger;
  return this.clone((type: IValue) => {
    type._debug = true;
  });
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
  for (let key in parent) {
    switch (key) {
    case '_cache': { value._cache = new _Map(); } break ;
    default: {
      const property = _Object.getOwnPropertyDescriptor(parent, key);
      if (property == null) continue ;
      if ('value' in property) {
        switch (_Object.prototype.toString.call(property.value)) {
        case '[object Array]': { value[key] = _Array.from(parent[key]); } break ;
        case '[object Set]':   { value[key] = new _Set(parent[key]); } break ;
        case '[object Map]':   { value[key] = new _Map(parent[key]); } break ;
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
      type._default = () => defaultValue.default();
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
  notEmpty: this
}

export const String = (<IString>Value.extends('String'))
  .setProperty('notEmpty', function notEmpty() {
    return this.addConstraint((value: string) => _String(value) !== '');
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
  _tests:     Array<[any, (val: any) => boolean]>;
  _sensitive: boolean;
  _notrim:    boolean;
  strict:     this;
  as<T>(this: T, value: any, ...tests: Array<any>): T;
}

export const Enum = (<IEnum>Value.extends('Enum'))
  .setProperty('_tests', [])
  .setProperty('_sensitive', false)
  .setProperty('_notrim', false)
  .setProperty('strict', function sensitive() {
    return this.clone((type: IEnum) => {
      type._sensitive = true;
      type._notrim = true;
    });
  }, true)
  .setProperty('as', function addCase(value: any, ...tests: Array<any>) {
    return this.clone((type: IEnum) => {
      if (tests.length === 0) tests.push(value);
      for (const test of tests) {
        switch (typeof test) {
        case 'number': {
          const strTest = _String(test);
          type._tests.push([value, input => input === strTest]);
        } break ;
        case 'string': {
          const strTest = type._sensitive ? test : test.toLowerCase();
          type._tests.push([value, input => input === strTest]);
        } break ;
        case 'function': {
          type._tests.push([value, test]);
        } break ;
        default : {
          if (test instanceof RegExp) {
            type._tests.push([value, input => test.test(input)]);
          } else {
            type._tests.push([value, input => input === test]);
          }
        } break ;
        }
      }
    })
  })
  .addParser(function parseValue(value: any) {
    switch (typeof value) {
    case 'number':
      value = _String(value);
    case 'string':
      if (!this._sensitive) value = value.toLowerCase();
      if (!this._notrim) value = value.trim();
    }
    for (const test of this._tests)
      if (test[1](value))
        return test[0];
    if (value) return value;
    return null;
  });

// Record
export interface IRecord extends IValue<Object> {
  _fields:  Map<string, IValue>;
  mayEmpty: this;

  add<T>(this: T, field: string, type: any):                               T;
  rewrite<T>(this: T, field: string, predicate: predicate<T>, value: any): T;
}

export const Record = (<IRecord>Value.extends('Record'))
  .setProperty('_fields', new _Map())
  .setProperty('of', function of(model: { [name: string]: any }) {
    const record = this.clone();
    for (const field in model) {
      if (model[field] instanceof _Array)
        record._fields.set(field, Value.of(...model[field]));
      else
        record._fields.set(field, Value.of(model[field]));
    }
    return record;
  })
  .setProperty('either', function either(...args: Array<Array<string> | string>) {
    return this.addConstraint((data: Object) => {
      either: for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (typeof arg === 'string') {
          if (data[arg] != null)
            return true;
        } else if (arg instanceof _Array) {
          for (let ii = 0; ii < arg.length; ii += 1)
            if (data[arg[ii]] == null)
              continue either;
          return true;
        } else {
          // Skip silently
        }
      }
      return false;
    });
  })
  .setProperty('add', function add(field: string, type: any) {
    return this.clone((record: IRecord) => {
      record._fields.set(field, Value.of(type));
    });
  })
  .setProperty('rewrite', function rewrite(field: string, predicate: any, value: any) {
    return this.addRewriter((record: any) => {
      if (record && predicate(record[field]))
        record[field] = value;
      return record;
    });
  })
  .setProperty('mayEmpty', function mayEmpty() {
    return this.setDefault(() => ({}));
  }, true)
  .addParser(function parseRecord(data: any, warn?: warn) {
    const result = new this();
    if ('$' in data) result['$'] = data.$;
    for (const [name, type] of this._fields) {
      try {
        const value = type.from(data[name], warn);
        if (value != null) result[name] = value;
      } catch (e) {
        const strval = JSON.stringify(data[name]);
        throw new TypeError('Failed on field: ' + name + ' = ' + strval, e);
      }
    }
    return result;
  })
  .addConstraint(function isRecord(data: any) {
    if (typeof data != 'object') throw new TypeError('Require an object');
  });

// Sum
export interface ISum extends IValue {
  _cases:        Map<any, IValue>;
  _defaultCase?: IValue;
  mayEmpty:      this;
  either<T>(this: T, hint: any, type: any): T;
}

export const Sum = (<ISum>Value.extends('Sum'))
  .setProperty('_cases', new _Map())
  .setProperty('either', function either(hint: any, casetype: IValue) {
    if (this._cases.has(hint)) throw new Error('this case already exists');
    return this.clone((type: ISum) => {
      type._cases.set(hint, casetype)
    });
  })
  .setProperty('mayEmpty', function mayEmpty() {
    return this.setDefault(() => new class Undefined {});
  }, true)
  .addParser(function parseValue(value: any, warn?: warn) {
    const valueType = typeof value;
    if (valueType !== 'object') {
      const type = this._cases.get(value);
      if (type != null) return type.from(value, warn);
      switch (valueType) {
      case 'boolean':
        if (this._cases.has(Boolean))  return this._cases.get(Boolean).from(value, warn);
        if (this._cases.has(_Boolean)) return this._cases.get(_Boolean).from(value, warn);
        break ;
      case 'number':
        if (this._cases.has(Number))  return this._cases.get(Number).from(value, warn);
        if (this._cases.has(_Number)) return this._cases.get(_Number).from(value, warn);
        break ;
      case 'string':
        if (this._cases.has(String))  return this._cases.get(String).from(value, warn);
        if (this._cases.has(_String)) return this._cases.get(_String).from(value, warn);
        break ;
      }
    } else if ('$' in value && this._cases.has(value.$)) {
      return this._cases.get(value.$).from(value, warn);
    } else if (this._defaultCase != null) {
      return this._defaultCase.from(value, warn);
    }
    return null;
  });

// Collection
export interface ICollection<A> extends IValue<A> {
  _subtype: IValue;
  notEmpty: this;
}

export const Collection = (<ICollection<any>>Value.extends('Collection'))
  .setProperty('_subtype', null)
  .setProperty('notEmpty', function notEmpty() {
    throw new Error('Not implemented');
  }, true);

// Set
export interface ISet extends ICollection<Set<any>> {
  toJSON: (this: Set<any>) => any;
}

export const Set = (<ISet>Collection.extends('Set'))
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
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array || data instanceof _Set)) return ;
    const set = new _Set();
    for (const value of data)
      set.add(this._subtype.from(value, warn));
    _Object.defineProperty(set, 'toJSON', { value: this.toJSON });
    return set;
  })
  .addConstraint(function isSet(data: any) {
    if (!(data instanceof _Set)) throw new TypeError('Require a Set');
  });

// Array
export interface IArray extends ICollection<Array<any>> {
}

export const Array = (<IArray>Collection.extends('Array'))
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
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array)) return ;
    const array = new _Array();
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
  _index: IValue;
  toJSON: (this: Map<any, any>) => any;
}

export const Map = (<IMap>Collection.extends('Map'))
  .setProperty('_index', null)
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
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array || data instanceof _Map)) return ;
    const map = new _Map();
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


//---------------------------

/*
// GPSPoint
export interface IGPSPoint extends IRecord {}

export const _GPSPoint = <IGPSPoint>Record.extends(function GPSPoint() {})
  .add('longitude', _Number)
  .add('latitude', _Number);


// Distance
export interface IDistance extends IRecord {}

export const _Distance = <IDistance>Record.extends(function Distance() {})
  .add('value', _Number)
  .add('unit', Enum.of('m', 'km'));
*/

