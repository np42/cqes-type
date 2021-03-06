import { v4 as uuid }      from 'uuid';
import { isConstructor, isLambda, get as getInObject
       }                   from 'cqes-util';
import { MatchAny, PM, K } from 'cqes-match';
import { inspect }         from 'util';

// TODO:
//  > Add Range Type: 5-10, 5 or more, 10 or less, not between 5-10
//  > Handle Recursive Sum Types

const TYPE_TAG      = Symbol('cqes-type');
const GETTER_PREFIX = '__get_';

const knowledge = { String: {}, Object: {} };

export const _Boolean  = globalThis.Boolean;
export const _Number   = globalThis.Number;
export const _String   = globalThis.String;
export const _Function = globalThis.Function;
export const _Object   = globalThis.Object;
export const _Date     = globalThis.Date;
export const _Set      = globalThis.Set;
export const _Array    = globalThis.Array;
export const _Map      = globalThis.Map;

export type Typer<T = any> = { new (): T; } & typeof Any;

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

export type preRewriter<T>  = (this: T, a: any) => any;
export type postRewriter<T> = (this: T, a: any, b?: any) => any;
export type predicate<T>    = (this: T, a: any) => boolean;
export type assertion<T>    = (this: T, a: any) => void;
export type constraint<T>   = RegExp | predicate<T> | assertion<T>;
export type parser<T>       = (this: T, a: any)       => any | void;
export type warn            = (error: Error)          => void;
export type filler          = (input: any, source: any) => any;

const makeConstructor = (name: string) => {
  if (!/^[a-z$_][a-z0-9$_]*$/i.test(name)) throw new Error('Bad name');
  const Type = eval
  ( [ '(function ' + name + '() {'
    , '  if (this instanceof ' + name + ') return this;'
    , '  return ' + name + '.of.apply(' + name + ', arguments);'
    , '})'
    ].join('\n')
  );
  tagCQESType(Type);
  return Type;
}

const makeCollectionConstructor = (name: string, collection: Function, methods?: { [key: string]: any }) => {
  if (!/^[a-z$_][a-z0-9$_]*$/i.test(name)) throw new Error('Bad name');
  const Type = eval
  ( [ '(function (Collection) {'
    , '  return class ' + name + ' extends Collection {};'
    , '})'
    ].join('\n')
  )(collection);
  tagCQESType(Type);
  return Type;
};

const getFirstValue = (source: { [name: string]: any }, keys: Array<string>) => {
  if (source == null) return null;
  for (const key of keys) {
    const value = getInObject(source, key);
    if (value !== undefined)
      return value;
  }
  return null;
};

const fnHasNativeProps = _Object.getOwnPropertyNames(function () {}).reduce((result, key) => {
  result[key] = true;
  return result;
}, {});

const tagCQESType = (Type: any) => {
  _Object.defineProperty(Type, TYPE_TAG, { value: true, enumerable: false, writable: false });
}

export function isType(Type: any, name?: string): Type is Typer {
  if (!(Type && Type[TYPE_TAG])) return false;
  if (name == null) return true;
  return Type.name === name;
}

export function getType(value: any, warn?: warn): IAny {
  if (isType(value)) return <any>value;
  if (isLambda(value)) return getType(value(), warn);
  if (warn != null) warn(new Error('Unable to get type from: ' + value));
  return Any;
}

const toStringMethodProperty = { configurable: true, writable: true, enumerable: false, value: function () {
  if (this.constructor.toString !== _Object.prototype.toString) return this.constructor.toString(this);
  return _Object.prototype.toString.call(this);
} };


// Any
export interface IAny<A = any> {
  new ():         A;

  _default:       (input?: any) => A;
  _preRewriters:  Array<preRewriter<any>>;
  _postRewriters: Array<postRewriter<any>>;
  _parsers:       Array<any>;
  _assertions:    Array<any>;
  _cache:         Map<string, IAny<A>>;
  _source?:       string;
  _fqnBase?:      string;

  defineProperty(name: string, value: any, isGetter?: boolean): void;

  extends<T>(this: T, name: string):                                     T;
  locate<T>(this: T, filepath: string, name?: string):                   T;
  clone<T>(this: T, fn?: (type: T) => void):                             T;
  of<T>(this: T, ...a: any[]):                                           T;
  setProperty<T>(this: T, name: string, value: any, isGetter?: boolean): T;
  unsetProperty<T>(this: T, name: string):                               T;

  addPreRewriter<T>(this: T, rewriter: preRewriter<T>):                  T;
  setDefault<T>(this: T, fn: any):                                       T;
  addParser<T>(this: T, fn: parser<T>):                                  T;
  addPostRewriter<T>(this: T, rewriter: postRewriter<T>):                T;
  addConstraint<T>(this: T, fn: constraint<T>):                          T;

  // TODO: add .toString .toJSON methods

  mayNull:  this;
  fqn:      string;

  test(data: any): boolean;
  from<X>(this: new (input?: any) => X, data?: any, warn?: warn): X;
  compare(from: any, to: any): number;
  walk<X>(this: new (x?: A) => X, data: X, iter: string, key?: any, ...args: Array<any>): X;
}

export type MayLazy<T> = T | (() => T);

export type ILazyAny = MayLazy<IAny>;

export const Any = <IAny><unknown>function Any() {};

tagCQESType(Any);

Any.defineProperty = function defineProperty(name: string, value: any, isGetter?: boolean) {
  if (isGetter) {
    if (typeof value === 'function' && value.length === 0) {
      const indirection = GETTER_PREFIX + name;
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

Any.defineProperty('_cache',         new _Map());
Any.defineProperty('_preRewriters',  new _Array());
Any.defineProperty('_postRewriters', new _Array());
Any.defineProperty('_parsers',       new _Array());
Any.defineProperty('_assertions',    new _Array());

Any.defineProperty('type', function type() {
  return this;
});

Any.defineProperty('extends', function extend(name: string, exclude?: Array<string>) {
  const value = makeConstructor(name);
  tagCQESType(value);
  let parent = this;
  while (parent != null) {
    if (parent.hasOwnProperty(TYPE_TAG)) break ;
    parent = _Object.getPrototypeOf(parent);
  }
  if (parent == null) throw new Error('Must be a CQES/Type');
  const props = [].concat(_Object.getOwnPropertyNames(this), _Object.getOwnPropertyNames(parent));
  for (let key of props) {
    if (exclude && ~exclude.indexOf(key)) continue ;
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
        default: {
          if (property.value === null) {
            _Object.defineProperty(value, key, property);
          } else if (property.value.constructor === _Object) {
            _Object.defineProperty(value, key, { ...property, value: { ...property.value } });
          } else {
            // Custom Object, don't know how to clone it
            _Object.defineProperty(value, key, property);
          }
        } break ;
        }
      } else {
        _Object.defineProperty(value, key, property);
      }
    } break ;
    }
  }
  return value;
});

Any.defineProperty('clone', function clone(modifier?: (a: any) => any, exclude?: Array<string>) {
  const value = this.extends(this.name, exclude);
  if (modifier) modifier.call(null, value);
  return value;
});

Any.defineProperty('locate', function locate(filepath: string, name?: string) {
  const type = this.extends(name ?? this.name);
  type._source = filepath;
  type._fqnBase = filepath.split('/').reverse().reduce((fqn, fullname) => {
    const name = fullname.split('.').shift();
    if (/^[A-Z0-9]/.test(name)) fqn.unshift(name);
    return fqn;
  }, []).join(':');
  return type;
});

Any.defineProperty('fqn', function fqn() {
  return this._fqnBase != null ? this._fqnBase + ':' + this.name : this.name;
}, true);

Any.defineProperty('of', function of(model?: any, ...rest: any[]) {
  if (model && model[TYPE_TAG]) return model;
  if (isConstructor(model)) throw new Error(model.name + ' is not a valid type, forgot an import ?');
  throw new Error('Any can not hold value');
});

Any.defineProperty('setProperty', function setProperty(name: string, value: any, isGetter?: boolean) {
  return this.clone((type: IAny) => {
    type.defineProperty(name, value, isGetter);
  });
});

Any.defineProperty('unsetProperty', function unsetProperty(name: string) {
  return this.clone(null, [name]);
});

Any.defineProperty('setDefault', function setDefault(defaultValue: any) {
  return this.clone((type: IAny) => {
    if (isType(defaultValue)) {
      type._default = () => (<IAny>defaultValue)._default();
    } else if (isConstructor(defaultValue)) {
      type._default = () => new defaultValue();
    } else if (typeof defaultValue === 'function') {
      type._default = defaultValue;
    } else {
      type._default = () => defaultValue;
    }
  });
});

Any.defineProperty('mayNull', function mayNull() {
  return this.setDefault(null);
}, true);

Any.defineProperty('addPreRewriter', function rewrite<T>(rewriter: preRewriter<T>) {
  if (rewriter == null) throw new Error('Require a function');
  return this.clone((type: IAny) => {
    type._preRewriters.push(rewriter);
  });
});

Any.defineProperty('addPostRewriter', function rewrite<T>(rewriter: postRewriter<T>) {
  if (rewriter == null) throw new Error('Require a function');
  return this.clone((type: IAny) => {
    type._postRewriters.unshift(rewriter);
  });
});

Any.defineProperty('addParser', function addParser<T>(parser: parser<T>) {
  if (parser == null) throw new Error('Require a function');
  return this.clone((value: IAny) => value._parsers.unshift(parser));
});

Any.defineProperty('addConstraint', function addConstraint<T>(constraint: constraint<T>) {
  if (constraint == null) throw new Error('Require a defined constraint');
  return this.clone((value: IAny) => {
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

Any.defineProperty('test', function test(value: any) {
  try {
    if (this.from(value) != null)
      return true;
  } catch (e) {
  }
  return false;
});

Any.defineProperty('from', function from(value?: any, warn?: warn) {
  for (let i = 0; i < this._preRewriters.length; i += 1)
    value = this._preRewriters[i].call(this, value);
  const preparedValue = value;
  if (value == null) {
    if (this._default != null) value = this._default(value);
    else throw new TypeError('Mandatory value is missing, no default defined');
    if (value === null) return null;
  }
  try {
    for (let i = 0; i < this._parsers.length; i += 1) {
      const result = this._parsers[i].call(this, value, warn);
      if (result == null) continue ;
      value = result;
      break ;
    }
    for (let i = 0; i < this._postRewriters.length; i += 1)
      value = this._postRewriters[i].call(this, value, preparedValue);
    for (let i = 0; i < this._assertions.length; i += 1)
      if (this._assertions[i].call(this, value) === false)
        throw new Error(this._assertions[i].name + ' not satisfied');
  } catch (e) {
    if (this._default == null) throw e;
    else if (warn != null) warn(e);
    const message = e.toString().split('\n').pop().substr(7);
    value = this._default(value);
  }
  return value;
});

Any.defineProperty('compare', function compare(from: any, to: any) {
  if (from === to) return 0;
  if (from == null && to == null) return 0;
  if (typeof from === 'number' && typeof to === 'number')
    if (isNaN(from) && isNaN(to)) return 0;
  return 1;
});

Any.defineProperty('walk', function walk<A>(data: A, iter: string, key: any, ...args: Array<any>): A {
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
export interface IBoolean extends IAny<Boolean> {
  _true:  Set<string>;
  _false: Set<string>;
}

export const Boolean = (<IBoolean>Any.extends('Boolean'))
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
export interface INumber extends IAny<Number> {
  between<T>(this: T, min: number, max: number): T;
  greater<T>(this: T, limit: number): T;
  lesser<T>(this: T, limit: number): T;
  positive: this;
  integer:  this;
  natural:  this;
}

export const Number = (<INumber>Any.extends('Number'))
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
export interface IString extends IAny<String> {
  notEmpty: this;
  notBlank: this;
}

export const String = (<IString>Any.extends('String'))
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
export interface IEnum extends IAny<String> {
  _iterTests: Array<[(val: any) => boolean, any]>;
  _strTests:  { [key: string]: any };
  _sensitive: boolean;
  _notrim:    boolean;
  _first:     null;
  strict:     this;
  as<T>(this: T, value: any, ...tests: Array<any>): T;
  of<T>(this: T, ...values: Array<any>): T
}

export const Enum = (<IEnum>Any.extends('Enum'))
  .setProperty('_iterTests', [])
  .setProperty('_strTests',  {})
  .setProperty('_sensitive', true)
  .setProperty('_notrim',    false)
  .setProperty('_first',     null)
  .setProperty('_default', function (value: any) {
    if (value == null) return this._first;
    for (const parser of this._parsers)
      if (parser.call(this, value) != null)
        return this._first;
    throw new Error('Given value: "' + value + '" is not in Enum');
  })
  .setProperty('strict', function sensitive() {
    return this.clone((type: IEnum) => {
      type._sensitive = true;
      type._notrim = true;
    });
  }, true)
  .setProperty('mayNull', function () {
    const _default = this._default;
    return this.clone((type: IEnum) => {
      type._default = function (value: any) {
        try { return _default(value); }
        catch (e) { return null; }
      };
    });
  }, true)
  .setProperty('as', function addCase(...tests: Array<any>) {
    const value = tests[0];
    return this.clone((type: IEnum) => {
      if (type._first == null) type._first = value;
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
    });
  })
  .setProperty('of', function addCases(...values: Array<any>) {
    let result = this;
    for (const value of values)
      result = result.as(value);
    return result;
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
    if (this._strTests[search] != null)
      return this._strTests[search];
    if (/^\s*$/.test(search)) return this._default();
    throw new TypeError('Value not declared in Enum');
  })
  .addConstraint(function mustBeInRange(value: any) {
    for (const parser of this._parsers)
      if (parser.call(this, value) != null)
        return ;
    throw new Error('Value is not in Enum');
  });

// Sum
export interface ISum extends IAny<{ _: string }> {
  _cases:        Map<string, { type: MayLazy<IObject>, test: PM }>;
  _defaultCase?: IAny;
  mayEmpty:      this;
  either<T>(this: T, name: string, type: MayLazy<IObject>, test?: any): T;
}

export const Sum = (<ISum>Any.extends('Sum'))
  .setProperty('_cases', new _Map())
  .setProperty('either', function either<T>(name: string, type: IObject, testPattern?: any) {
    if (this._cases.has(name)) throw new Error('this case already exists');
    return this.clone((sum: ISum) => {
      const test = typeof testPattern !== 'undefined' ? new MatchAny(knowledge, testPattern) : null;
      sum._cases.set(name, { type, test });
    });
  })
  .setProperty('mayEmpty', function mayEmpty() {
    return this.setDefault(() => new class Undefined {});
  }, true)
  .setProperty('compare', function compare(from: any, to: any) {
    if (to && to._) return this._cases.get(to._).compare(from, to);
    return 1;
  })
  .setProperty('walk', function walk<A>(data: any, iter: string, key: any, ...args: Array<any>): A {
    if (data == null) data = <any>({ _: null });
    if (typeof this[iter] === 'function') {
      const value = this[iter].call(this, data._, args[0], key, ...args.slice(1));
      if (typeof value === 'string') data._ = value;
    }
    if (this._cases.has(data._) && typeof data._ === 'string') {
      const value = this._cases.get(data._).walk(data, iter, key, ...args);
      if (value !== undefined && value != data) data = value;
    }
    if (typeof this[iter + '_after'] === 'function') {
      const value = this[iter + '_after'].call(this, data, args[0], key, ...args.slice(1));
      if (value !== undefined && value != data) data = value;
    }
    if (data._ != null) return data;
    return null;
  })
  .addParser(function parseValue(value: any, warn?: warn) {
    const [_, result] = (() => {
      if (typeof value === 'object' && this._cases.has(value._)) {
        const type = this._cases.get(value._).type;
        return [value._, getType(type, warn).from(value, warn)];
      } else {
        for (const [name, { type, test }] of this._cases) {
          if (test == null) continue ;
          if (!test.test(value)) continue ;
          return [name, getType(type, warn).from(value, warn)];
        }
        if (this._defaultCase != null) {
          return [this._defaultCase.name, this._defaultCase.from(value, warn)];
        }
      }
      throw new Error('Unable to handle this value');
    })();
    if (result != null) {
      _Object.defineProperty
      ( result, '_', { value: _, configurable: true, enumerable: true, writable: false }
      );
    }
    return result;
  });

// Collection
export interface ICollection<A> extends IAny<A> {
  (...types: any[]):  this;
  notEmpty: this;
}

export const Collection = (<ICollection<any>>Any.extends('Collection'))
  .setProperty('notEmpty', function notEmpty() {
    throw new Error('Not implemented');
  }, true)
;

// Set
export interface ISet extends ICollection<Set<any>> {
  _constructor: { new (): Set<any> };
  _subtype: ILazyAny;
  from<X>(this: new () => X, data: Set<any> | Array<any>, warn?: warn): X;
  has(source: Set<any>, value: any): boolean;
  compare(from: Set<any>, to: Set<any>): number;
  toJSON: (this: Set<any>) => any;
}

export const Set = (<ISet>Collection.extends('Set'))
  .setProperty('_constructor', function () {
    const Set = makeCollectionConstructor(this.name, _Set);
    const toJSON = this.toJSON;
    return function (...args: any[]) {
      const set = new Set(...args);
      _Object.defineProperty(set, 'toJSON', { value: toJSON });
      return set;
    };
  }, true)
  .setProperty('_subtype', null)
  .setProperty('of', function (type: any) {
    return this.clone((value: ISet) => { value._subtype = type });
  })
  .setProperty('toJSON', function toJSON() {
    return _Array.from(this);
  })
  .setProperty('notEmpty', function notEmpty() {
    return this.addConstraint(function notEmpty(value: any) {
      return value.size > 0;
    });
  }, true)
  .setProperty('has', function has(source: Set<any>, value: any) {
    if (source.has(value)) return true;
    const subtype = getType(this._subtype);
    for (const item of source) {
      if (subtype.compare(value, item) !== 0) continue ;
      return true;
    }
    return false;
  })
  .setProperty('compare', function compare(from: any, to: any) {
    let diff = 0;
    const subtype = getType(this._subtype);
    if (from) {
      for (const item of from) {
        if (this.has(to, item)) continue ;
        diff += subtype.compare(item, null);
      }
    }
    if (to) {
      for (const item of to) {
        if (this.has(from, item)) continue ;
        diff += subtype.compare(null, item);
      }
    }
    return diff;
  })
  .setProperty('walk', function walk<A>(data: any, iterator: string, key: any, ...args: Array<any>): A {
    if (data == null) return null;
    const copy = new _Set(data || []);
    const subtype = getType(this._subtype);
    data.clear();
    let i = 0;
    for (const item of copy) {
      data.add(subtype.walk(item, iterator, i, ...args));
      i += 1;
    }
    return data;
  })
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array || data instanceof _Set)) return ;
    const set = new this._constructor();
    const subtype = getType(this._subtype, warn);
    for (const value of data)
      set.add(subtype.from(value, warn));
    return set;
  })
  .addParser(function parseString(data: any, warn?: warn) {
    if (typeof data !== 'string') return ;
    const set = new this._constructor();
    const subtype = getType(this._subtype, warn);
    const insert = (entries: Array<string>) => {
      entries.forEach(x => set.add(subtype.from(x, warn)));
    };
    if (/\r?\n/.test(data))    insert(data.split(/\r?\n/));
    else if (/[,]/.test(data)) insert(data.split(/,\s*/));
    else if (/[:]/.test(data)) insert(data.split(/:/));
    else if (/\s/.test(data))  insert(data.split(/\s+/));
    return set;
  })
  .addConstraint(function isSet(data: any) {
    if (!(data instanceof _Set)) throw new TypeError('Require a Set');
  })
;

// Array
export interface IArray<T = any> extends ICollection<Array<T>> {
  _constructor:    { new (): Array<T> };
  _subtype:        ILazyAny;
  _discardInvalid: boolean;
  compare(from: Array<any>, to: Array<any>): number;
  discardInvalid:  this;
}

export const Array = (<IArray>Collection.extends('Array'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Array);
  }, true)
  .setProperty('_subtype', null)
  .setProperty('_discardInvalid', false)
  .setProperty('_default', function () {
    return new this._constructor();
  })
  .setProperty('of', function (type: any) {
    return this.clone((value: IArray) => value._subtype = type);
  })
  .setProperty('notEmpty', function notEmpty() {
    return this.addConstraint(function notEmpty(value: any) {
      return value.length > 0;
    });
  }, true)
  .setProperty('discardInvalid', function discardInvalid() {
    return this.clone((value: IArray) => value._discardInvalid = true);
  }, true)
  .setProperty('compare', function compare(from: any, to: any) {
    const length = Math.max(from.length, to.length);
    let diff = 0;
    const subtype = getType(this._subtype);
    for (let i = 0; i < length; i += 1)
      diff += subtype.compare(from[i], to[i]);
    return diff;
  })
  .setProperty('walk', function walk<A>(data: any, iterator: string, key: any, ...args: Array<any>): A {
    if (data == null) return null;
    const subtype = getType(this._subtype);
    for (let i = 0; i < data.length; i += 1)
      data[i] = subtype.walk(data[i], iterator, i, ...args);
    return data;
  })
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array)) return ;
    const array = new this._constructor();
    const subtype = getType(this._subtype, warn);
    for (let i = 0; i < data.length; i += 1) {
      try { array.push(subtype.from(data[i], warn)); }
      catch (e) {
        if (this._discardInvalid) {
          continue ;
        } else {
          const strval = JSON.stringify(data[i]);
          throw new TypeError('Failed on index: ' + i + ' = ' + strval, e);
        }
      }
    }
    return array;
  })
  .addParser(function parseString(data: any, warn?: warn) {
    if (typeof data !== 'string') return ;
    const array = new this._constructor();
    const subtype = getType(this._subtype, warn);
    const insert = (entries: Array<string>) => array.splice(0, 0, ...entries.map(x => subtype.from(x)))
    if (/\r?\n/.test(data))    insert(data.split(/\r?\n/));
    else if (/[,]/.test(data)) insert(data.split(/,\s*/));
    else if (/[:]/.test(data)) insert(data.split(/:/));
    else if (/\s/.test(data))  insert(data.split(/\s+/));
    return array;
  })
  .addConstraint(function isArray(data: any) {
    if (!(data instanceof _Array)) throw new TypeError('Require an Array');
  });


// Map
export interface IMap extends ICollection<Map<any, any>> {
  _constructor: { new (): Map<any, any> };
  _index:       ILazyAny;
  _subtype:     ILazyAny;
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
    const map = new this._constructor();
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
      value._index = index;
      value._subtype = type;
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
    const subtype = getType(this._subtype);
    let diff = 0;
    if (from) {
      for (const [key, value] of from) {
        const otherValue = this.get(to, key);
        diff += subtype.compare(value, otherValue);
        if (otherValue != null) done.add(otherValue);
      }
    }
    if (to) {
      for (const [key, value] of to) {
        if (done.has(value)) continue ;
        diff += subtype.compare(null, value);
      }
    }
    return diff;
  })
  .setProperty('walk', function walk<A>(data: any, iterator: string, key: any, ...args: Array<any>): A {
    if (data == null) return null;
    const subtype = getType(this._subtype);
    for (const [key, value] of data)
      data.set(key, subtype.walk(value, iterator, key, ...args));
    return data;
  })
  .addParser(function parseArray(data: any, warn?: warn) {
    if (!(data instanceof _Array || data instanceof _Map)) return ;
    const map = new this._constructor();
    const subtype = getType(this._subtype, warn);
    const indexType = getType(this._index, warn);
    for (const [key, value] of data) {
      try { map.set(indexType.from(key, warn), subtype.from(value, warn)); }
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
  _types:       Array<ILazyAny>;
  compare(from: any[], to: any[]): number;
}

export const Tuple = (<ITuple>Collection.extends('Tuple'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Array);
  }, true)
  .setProperty('_types', new _Array())
  .setProperty('of', function (...types: Array<any>) {
    return this.clone((value: ITuple) => {
      value._types = types.map(T => T);
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
        const type = getType(this._types[i], warn);
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
export interface IRecord extends IAny<{}> {
  _constructor: { new (): { [name: string]: any } };
  _members:     Map<string, { type: ILazyAny, postfill?: { filler: filler, enumerable: boolean } }>;
  _keepNull:    boolean;
  _collapse:    boolean;
  mayEmpty:     this;
  keepNull:     this;
  compare(from: { [name: string]: any }, to: { [name: string]: any }): number;
  add<T>(this: T, field: string, type: Typer, virtual?: filler | Array<string>): T;
  remove<T>(this: T, field: string): T;
  postfill<T>(this: T, field: string, filler: filler, enumerable?: boolean): T;
}

export const Record = (<IRecord>Any.extends('Record'))
  .setProperty('_constructor', function () {
    return makeCollectionConstructor(this.name, _Object);
  }, true)
  .setProperty('_members', new _Map())
  .setProperty('_keepNull', false)
  .setProperty('_collapse', false)
  .setProperty('mayEmpty', function mayEmpty() {
    return this.setDefault(() => {});
  }, true)
  .setProperty('keepNull', function keepNullValues() {
    return this.clone((object: IRecord) => {
      object._keepNull = true;
    });
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
  .setProperty('add', function add(field: string, type: any, filler?: filler | Array<string>) {
    return this.clone((object: IRecord) => {
      const enumerable = true;
      const postfill = filler != null
        ? ( filler instanceof _Array ? { filler: (r: any, s: any) => getFirstValue(s, filler), enumerable }
          : { filler, enumerable }
          )
        : null;
      object._members.set(field, { type, postfill });
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
    const fillers = <{ [name: string]: { type: IAny, postfill: filler, enumerable: boolean } }>{};
    for (const [name, { type, postfill }] of this._members) {
      const _type = getType(type, warn);
      try {
        const value = _type.from(data[name], warn);
        if (value != null || this._keepNull)
          result[name] = value;
      } catch (e) {
        if (postfill != null) continue ;
        const strval = JSON.stringify(data[name]);
        throw new TypeError('Failed on field: ' + name + ' = ' + strval, e);
      } finally {
        if (result[name] == null && postfill != null)
          fillers[name] = { type: _type, postfill: postfill.filler, enumerable: !!postfill.enumerable };
      }
    }
    for (const name in fillers) {
      const { type, postfill, enumerable } = fillers[name];
      let value = null;
      try {
        value = postfill.call(this, result, data);
        value = type.from(value, warn);
        if (value != null) _Object.defineProperty(result, name, { value, enumerable, writable: true });
      } catch (e) {
        const strval = JSON.stringify(value);
        throw new TypeError('Failed on field: ' + name + ' = ' + strval, e);
      }
    }
    return result;
  })
  .addPostRewriter(function (record: any) {
    if (record == null) return null;
    _Object.defineProperty(record, 'toString', toStringMethodProperty);
    return record;
  })
  .addPostRewriter(function (record: any) {
    if (record == null) return null;
    if (!this._collapse) return record;
    for (const key in record) return record;
    return null;
  });

// Object
type IObjectBase = IRecord & { _: string };
export interface IObject extends Exclude<IObjectBase, 'mayEmpty'> {}

export const Object = (<IObject>Record.extends('Object'))
  .unsetProperty('mayEmpty')
  .keepNull
  .addPostRewriter(function (data: any) {
    const output = new this();
    const descriptors = { _: { value: this.name, configurable: true, enumerable: true, writable: false }
                        , ..._Object.getOwnPropertyDescriptors(data)
                        };
    _Object.defineProperties(output, descriptors);
    return output;
  })
  .addConstraint(function isObject(data: any) {
    if (typeof data != 'object') throw new TypeError('Require an object');
  });


// Entity
type IEntityBase = IRecord & { _id?: any };
export interface IEntity extends IEntityBase {}

export const Entity = (<IEntity>Record.extends('Entity'))
  .setProperty('_constructor', function () {
    const constructor = makeCollectionConstructor(this.name, _Object);
    return function (...args: any[]) {
      const data = constructor(...args);
      _Object.defineProperty(data, '_id', { value: null, configurable: true, writable: true, enumerable: false });
      return data;
    };
  }, true)
  .addPostRewriter(function (data: any, initialValue: any) {
    if (!(typeof initialValue == 'object')) return data;
    if (data._id != null) return data;
    const idKey = this.name.slice(0, 1).toLowerCase() + this.name.slice(1) + 'Id';
    const _id = initialValue._id || initialValue[idKey] || initialValue.id;
    if (_id != null)
      _Object.defineProperty(data, '_id', { value: _id, configurable: true, writable: false, enumerable: true });
    return data;
  });

// AggregateRoot
export interface IAggregateRoot extends IEntity {}

export const AggregateRoot = (<IAggregateRoot>Entity.extends('AggregateRoot'))
;

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

// Json
export interface IJson extends IString {}

export const Json = (<IJson>String.extends('Json'))
  .addConstraint(function (input: string) {
    if (typeof input !== 'string') throw new TypeError('Require a string');
    JSON.parse(input);
  });

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
  .addParser(function parseDate(value: any) {
    if (typeof value !== 'string') return ;
    const match = /^T?(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{3}))?$/.exec(value);
    if (match == null) throw new TypeError('Bad Time format');
    const hours = _Number(match[1]);
    if (!(hours >= 0 && hours < 24)) throw new TypeError('Bad Time format, hours out of range');
    const minutes = _Number(match[2]);
    if (!(minutes >= 0 && minutes <= 60)) throw new TypeError('Bad Time format, minutes out of range');
    const seconds = match[3] == null ? 0 : _Number(match[3]);
    if (!(seconds >= 0 && seconds <= 60)) throw new TypeError('Bad Time format, seconds out of range');
    const miliseconds = match[4] == null ? 0 : _Number(match[4]);
    if (!(miliseconds >= 0 && miliseconds < 1000)) throw new TypeError('Bad Time format, miliseconds out of range');
    return ( [ _String(hours).padStart(2, '0')
             , _String(minutes).padStart(2, '0')
             , _String(seconds).padStart(2, '0')
             ].join(':')
           + ( miliseconds > 0 ? '.' + _String(miliseconds).padStart(3, '0') : '' )
           );
  })
  .addConstraint(function isTime(value: any) {
    if (/^\d{2}:\d{2}:\d{2}(\.\d{3})?$/.test(value)) return ;
    throw new TypeError('Invalide Time format');
  });


// DateTime
export interface IDateTime extends IString {
  mayNow: this;
}

export const DateTime = (<IDateTime>Any.extends('DateTime'))
  .setProperty('mayNow', function mayNow() {
    return this.setDefault(() => new _Date());
  }, true)
  .addParser(function parseTimestamp(value: number) {
    if (typeof value !== 'number' || !(value > 0)) return ;
    return new _Date(value);
  })
  .addParser(function parseString(value: string) {
    if (typeof value !== 'string') return ;
    const date = /^\d{4}(-\d\d){2}( |T)(\d\d)([:hH]\d\d){2}([\.sS]\d{3})?(Z|[+\-]\d+)?$/.exec(value);
    // FIXME: date variable is not used !?
    return new _Date(value);
  })
  .addConstraint(function isDate(value: Date) {
    if (!(value instanceof _Date)) throw new TypeError('Require a JsDate');
    if (value.toString() === 'Invalid Date') throw new TypeError('Invalid date format');
  });

// Words

export class Done      extends Record.mayEmpty {};
export class NotFound  extends Record.mayEmpty {};
export class Unchanged extends Record.mayEmpty {};
