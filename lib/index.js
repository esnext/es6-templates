var assert = require('assert');
var through = require('through');
var recast = require('recast');
var types = recast.types;
var PathVisitor = types.PathVisitor;
var n = types.namedTypes;
var b = types.builders;

function Visitor() {
  PathVisitor.apply(this, arguments);
}
Visitor.prototype = Object.create(PathVisitor.prototype);
Visitor.prototype.constructor = Visitor;

/**
 * Visits a template literal, replacing it with a series of string
 * concatenations. For example, given:
 *
 *    ```js
 *    `1 + 1 = ${1 + 1}`
 *    ```
 *
 * The following output will be generated:
 *
 *    ```js
 *    "1 + 1 = " + (1 + 1)
 *    ```
 *
 * @param {NodePath} path
 * @returns {AST.Literal|AST.BinaryExpression}
 */
Visitor.prototype.visitTemplateLiteral = function(path) {
  var node = path.node;
  var replacement = b.literal(node.quasis[0].value.cooked);

  for (var i = 1, length = node.quasis.length; i < length; i++) {
    replacement = b.binaryExpression(
      '+',
      b.binaryExpression(
        '+',
        replacement,
        node.expressions[i - 1]
      ),
      b.literal(node.quasis[i].value.cooked)
    );
  }

  return replacement;
};

/**
 * Visits the path wrapping a TaggedTemplateExpression node, which has the form
 *
 *   ```js
 *   htmlEncode `<span id=${id}>${text}</span>`
 *   ```
 *
 * @param {NodePath} path
 * @returns {AST.CallExpression}
 */
Visitor.prototype.visitTaggedTemplateExpression = function(path) {
  var node = path.node;
  var args = [];
  var strings = b.callExpression(
    b.functionExpression(
      null,
      [],
      b.blockStatement([
        b.variableDeclaration(
          'var',
          [
            b.variableDeclarator(
              b.identifier('strings'),
              b.arrayExpression(node.quasi.quasis.map(function(quasi) {
                return b.literal(quasi.value.cooked);
              }))
            )
          ]
        ),
        b.expressionStatement(b.assignmentExpression(
          '=',
          b.memberExpression(b.identifier('strings'), b.identifier('raw'), false),
          b.arrayExpression(node.quasi.quasis.map(function(quasi) {
            return b.literal(quasi.value.raw);
          }))
        )),
        b.returnStatement(b.identifier('strings'))
      ])
    ),
    []
  );

  args.push(strings);
  args.push.apply(args, node.quasi.expressions);

  return b.callExpression(
    node.tag,
    args
  );
};

var VISITOR = new Visitor();

/**
 * Transform an Esprima AST generated from ES6 by replacing all template string
 * nodes with the equivalent ES5.
 *
 * NOTE: The argument may be modified by this function. To prevent modification
 * of your AST, pass a copy instead of a direct reference:
 *
 *   // instead of transform(ast), pass a copy
 *   transform(JSON.parse(JSON.stringify(ast));
 *
 * @param {Object} ast
 * @return {Object}
 */
function transform(ast) {
  return types.visit(ast, VISITOR);
}

/**
 * Transform JavaScript written using ES6 by replacing all template string
 * usages with the equivalent ES5.
 *
 *   compile('`Hey, ${name}!'); // '"Hey, " + name + "!"'
 *
 * @param {string} source
 * @param {{sourceFileName: string, sourceMapName: string}} mapOptions
 * @return {string}
 */
function compile(source, mapOptions) {
  mapOptions = mapOptions || {};

  var recastOptions = {
    sourceFileName: mapOptions.sourceFileName,
    sourceMapName: mapOptions.sourceMapName
  };

  var ast = recast.parse(source, recastOptions);
  return recast.print(transform(ast), recastOptions);
}

module.exports = function() {
  var data = '';
  return through(write, end);

  function write(buf) { data += buf; }
  function end() {
      this.queue(module.exports.compile(data).code);
      this.queue(null);
  }
};

module.exports.compile = compile;
module.exports.transform = transform;
