const T = require('..');

const pli = T.Tuple(T.Number, T.String);

console.log(pli.from(['42', new Date().toString()]));