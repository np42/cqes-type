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

});

describe('Sum', function () {

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

