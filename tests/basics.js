const { Record, Map, Array, Set, Sum, Object, Enum, String, Number, Boolean, Value
      }      = require('..');
const assert = require('assert');

describe('Value', function () {

});

describe('Boolean', function () {

});

describe('Number', function () {

});

describe('String', function () {

});

describe('Enum', function () {

});

describe('Object', function () {

  describe('$', function () {
    it('should has default Object', function () {
      const T = Object.add('field', Boolean.mayNull);
      assert.equal(T.from({}).$, 'Object');
    });
    it('should has named Type', function () {
      class Type extends Object.add('field', Boolean.mayNull) {};
      assert.equal(Type.from({}).$, 'Type');
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

});

describe('Sum', function () {

  describe('toString', function () {
    it('should has custom toString function', function () {
      class T extends Object.add('field', String) {
        static toString(data) { return data.field.slice(0, 4) + "'" + data.field.slice(4); }
      }
      class U extends Object.add('foo', Number) {
        static toString(data) { return data.foo + 1; }
      }
      class S extends Sum.either('U', U).either('T', T) {};
      assert.equal(S.from({ $: 'T', field: 'hello' }), "hell'o");
    });
  });

});

describe('Set', function () {

});

describe('Array', function () {

});

describe('Map', function () {

});

describe('Record', function () {

  describe('empty / not empty', function () {

    it('should reject empty Record', function () {
      class Shape extends Record.add('field', Boolean.mayNull) {};
      try { Shape.from({}); } catch (e) { return ; }
      throw new Error('Should failed');
    });

    it('should accept empty Record', function () {
      class Shape extends Record.mayEmpty.add('field', Boolean.mayNull) {};
      Shape.from({});
    });

  });

});

