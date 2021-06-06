const { AggregateRoot, Entity, Record, Map, Array, Set, Sum, Tuple, Object
      , Enum, String, Number, Boolean, Any, Date, Time, DateTime
      , _Date, _Array, _Set, _Map
      }      = require('..');
const assert = require('assert');

describe('Any', function () {
  describe('about location', function () {
    const fakepath = '/tmp/Context/Aggregate.groupment.js';
    class Order extends Any.locate(fakepath) {};
    it('should contains _source', function () {
      assert.equal(Order._source, fakepath);
    });
    it('should contains fqn', function () {
      assert.equal(Order.fqn, 'Context:Aggregate:Order');
    });
  });
});

describe('Boolean', function () {

});

describe('Number', function () {

});

describe('String', function () {

});

describe('DateTime', function () {

  describe('Invalid Date', function () {
    it('should return null', function () {
      const T = DateTime.mayNull;
      assert.equal(T.from(undefined), null);
    });
  });

  describe('DateTime without second', function () {
    it('should parse type', function () {
      assert.equal(DateTime.from('2020-11-10T12:45Z').toISOString(), '2020-11-10T12:45:00.000Z');
    });
  });

});

describe('Time', function () {

  describe('Invalid Time', function () {
    it('should return null', function () {
      assert.equal(Time.mayNull.from('25:41:00'), null);
    });
  });

  describe('Normal Time', function () {
    it('should parse type', function () {
      assert.equal(Time.from('12:45:32'), '12:45:32');
    });
  });

  describe('Time without second', function () {
    it('should parse type', function () {
      assert.equal(Time.from('15:22'), '15:22:00');
    });
  });

});

describe('Enum', function () {
  const T = Enum.as('A').as('B');

  describe('from', function () {
    it('should return value when in range', function () {
      assert.equal(T.from('B'), 'B');
    });
    it('should return default when empty', function () {
      assert.equal(T.from(), 'A');
    });
    it('should return default when blank', function () {
      assert.equal(T.from(' '), 'A');
    });
    it('should throw an error when other value', function () {
      try { T.from('C'); }
      catch (e) { return ; }
      throw new Error('Expected an error');
    });

    describe('mayNull', function () {
      it('should return null when null', function () {
        assert.equal(T.mayNull.from(), null);
      });
      it('should return null when blank', function () {
        assert.equal(T.mayNull.from(' '), null);
      });
      it('should return null when other value ', function () {
        assert.equal(T.mayNull.from('C'), null);
      });
    });
  });

  describe('immuable', function () {
    it('should not leaks states', function () {
      const A = Enum.mayNull.as('A');
      const B = Enum.mayNull.as('B');
      const BC = B.as('C');

      assert.equal(A.from('B'), null);
      assert.equal(B.from('C'), null);
      assert.equal(BC.from('B'), 'B');
      assert.equal(BC.from('C'), 'C');
    });
  });

});

describe('Sum', function () {

  describe('kind of accepted values', function () {
    it('should accept anonymous types', function () {
      class T extends Sum.either('A', Object.add('f', String)) {};
      assert.deepEqual(T.from({ _: 'A', f: '42' }), { _: 'A', f: '42' });
    });

    it('should accept name based value', function () {
      class T extends Sum
        .either('A', Object.add('f', String))
        .either('B', Object.add('f', Number))
      {};
      assert.deepEqual(T.from({ _: 'A', f: 42 }), { _: 'A', f: '42' });
      assert.deepEqual(T.from({ _: 'B', f: '42' }), { _: 'B', f: 42 });
    });

    it('should not accept undeclared content', function () {
      class T extends Sum
        .either('A', Object.add('f', String))
        .either('B', Object.add('f', Number))
      {};
      try { T.from({ k: 42 }) }
      catch (e) { return ; }
      throw new Error('Undeclared value { k: 42 } accepted');
    });
  });

  describe('toString', function () {
    it('should has custom toString function', function () {
      class T extends Object.add('field', String) {
        static toString(data) { return data.field.slice(0, 4) + "'" + data.field.slice(4); }
      }
      class U extends Object.add('foo', Number) {
        static toString(data) { return data.foo + 1; }
      }
      class S extends Sum.either('U', U).either('T', T) {};
      assert.equal(S.from({ _: 'T', field: 'hello' }).toString(), "hell'o");
    });
  });

});

describe('Set', function () {

  describe('subtype', function () {
    it('should accept getter function', function () {
      const T = Set(() => Toto);
      class Toto extends Number {};
      assert.deepEqual(T.from(['42']), new _Set([42]));
    });
  });

});

describe('Set(Enum)', function () {

  it('should accept all values', function () {
    const SE = Set(Enum.of('A', 'B', 'C'));
    assert.deepEqual(SE.from(['A', 'B', 'C']), new _Set(['A', 'B', 'C']));
  });

  it('should reject if one value not declared in enum', function () {
    const SE = Set(Enum.of('A', 'B', 'C'));
    try { SE.from(['A', 'C', 'D']); }
    catch (e) { return ; }
    throw new Error('Exception expected');
  });

});


describe('Array', function () {

  describe('subtype', function () {
    it('should accept getter function', function () {
      assert.deepEqual(Array(() => Number).from(['42']), [42]);
    });
  });

});

describe('Map', function () {

  it('should accept lazy Type', function () {
    const T = Map(() => I, () => J);
    const I = Number;
    const J = Boolean;
    assert.deepEqual(_Array.from(T.from([['42', 'Y']])), [[42, true]]);
  });

});

describe('Tuple', function () {

  it('should accept lazy Type', function () {
    class G extends Number {}
    const T = Tuple.of(() => F, G);
    const F = Boolean;
    assert.deepEqual(T.from(['YES', '42']), [true, 42]);
  });

});

describe('Record', function () {

  describe('empty / not empty', function () {
    it('should collapse on empty Record', function () {
      class Shape extends Record.setProperty('_collapse', true).add('field', Boolean.mayNull) {};
      assert.equal(Shape.from({}), null);
    });
    class Shape2 extends Record
      .add('field1', Record.setProperty('_collapse', true).add('sub', String.mayNull).mayNull)
      .add('field2', String)
    {}
    it('should collapse empty field if missing', function () {
      assert.deepEqual(Shape2.from({ field2: 'ok' }), { field2: 'ok' });
    });
    it('should collapse empty field if null', function () {
      assert.deepEqual(Shape2.from({ field1: null, field2: 'ok' }), { field2: 'ok' });
    });
    it('should collapse empty field if empty object', function () {
      assert.deepEqual(Shape2.from({ field1: {}, field2: 'ok' }), { field2: 'ok' });
    });
    it('should not accept null data', function () {
      class Test extends Record.add('f1', Enum.as('DefaultValue')) {};
      try { Test.from(null) }
      catch (e) { return ; }
      throw new Error('Should throw an error');
    });
    it('should accept empty object', function () {
      class Test extends Record.add('f1', Enum.as('DefaultValue')) {};
      assert.deepEqual(Test.from({}), { f1: 'DefaultValue' });
    });
  });

  it('should accept lazy Type', function () {
    const T = Record.add('f', () => F);
    const F = Boolean;
    assert.deepEqual(T.from({ f: 'YES' }), { f: true });
  });

  it('should handle virtual field', function () {
    const T = Record.add('f1', String).add('virtual', String, data => 'hello ' + data.f1);
    assert.equal(T.from({ f1: 'world' }).virtual, 'hello world');
  });

});


describe('Object', function () {

  describe('empty Object', function () {
    it('should not be null', function () {
      class Shape extends Object.add('field', Boolean.mayNull) {};
      assert.notEqual(Shape.from({}), null)
    });
  });

  describe('_ (Underscore)', function () {
    it('should has default Object', function () {
      const T = Object.add('field', Boolean.mayNull);
      assert.equal(T.from({})._, 'Object');
    });
    it('should has named Type', function () {
      class Type extends Object.add('field', Boolean.mayNull) {};
      assert.equal(Type.from({})._, 'Type');
    });
    it('should be serializable', function () {
      assert.equal(JSON.stringify(Object.from({})), '{"_":"Object"}');
    });
  });

  describe('fields', function () {
    it('should reject non declared fields', function () {
      const T = Object.add('field', Number);
      assert.deepEqual(T.from({ field: 42, extra: 'not expected' }), { _: 'Object', field: 42 });
    });
  });

  describe('toString', function () {
    it('should has custom toString function', function () {
      class T extends Object.add('field', String) {
        static toString(data) {
          return data.field.slice(0, 4) + "'" + data.field.slice(4);
        }
      }
      assert.equal(T.from({ field: 'hello' }), "hell'o");
    });
  });

  it('should accept lazy Type', function () {
    class T extends Object.add('f', () => F) {};
    const F = Boolean;
    const value = T.from({ f: 'YES' });
    assert.deepEqual(value, { _: 'T', f: true });
  });

});

describe('Entity', function () {

  describe('empty Entity', function () {
    it('should not be null', function () {
      class Shape extends Entity.add('field', Boolean.mayNull) {};
      assert.notEqual(Shape.from({}), null)
    });
  });

  describe('about _id field', function () {
    class Example extends Entity {};
    it('should has `_id` if `id` present in data', function () {
      assert.equal(Example.from({ _id: 42 })._id, 42);
    });
    it('should has `_id` if `<lowerCamelCaseName>Id` present in data', function () {
      assert.equal(Example.from({ exampleId: 42 })._id, 42);
    });
    it('should has `_id` if `_id` present in data', function () {
      assert.equal(Example.from({ id: 42 })._id, 42);
    });
    it('should has `_id` serialized', function () {
      assert.equal(JSON.stringify(Example.from({ _id: 42 })), '{"_id":42}');
    });
  });

});

describe('AggregateRoot', function () {

  describe('empty AggregateRoot', function () {
    it('should not be null', function () {
      class Shape extends AggregateRoot.add('field', Boolean.mayNull) {};
      assert.notEqual(Shape.from({}), null)
    });
  });

  describe('may empty for initialization', function () {
    class Toto extends AggregateRoot.add('field', String.mayNull) {};
    it('should accept empty data', function () {
      assert.deepEqual(Toto.from({}), {});
    });
  });

});