var assert = require('assert');
var through = require('through');
var esprima = require('esprima');
var recast = require('recast');
var types = recast.types;
var n = types.namedTypes;
var b = types.builders;

assert.ok(
  /harmony/.test(esprima.version),
  'looking for esprima harmony but found: ' + esprima.version
);

/**
 * Visits a node of an AST looking for template string expressions. This is
 * intended to be used with the ast-types `traverse()` function.
 *
 * @param {Object} node
 * @this {ast-types.Path}
 */
function visitNode(node) {
  var replacement;

  if (n.TemplateLiteral.check(node)) {
    replacement = b.literal(node.quasis[0].value.cooked);

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
  } else if (n.TaggedTemplateExpression.check(node)) {
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

    replacement = b.callExpression(
      node.tag,
      args
    );
  }

  if (replacement) {
    this.replace(replacement);
  }
}

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
  return types.traverse(ast, visitNode);
}

/**
 * Transform JavaScript written using ES6 by replacing all template string
 * usages with the equivalent ES5.
 *
 *   compile('`Hey, ${name}!'); // '"Hey, " + name + "!"'
 *
 * @param {string} source
 * @return {string}
 */
function compile(source, mapOptions) {
  mapOptions = mapOptions || {};

  var recastOptions = {
    // Use the harmony branch of Esprima that installs with this project
    // instead of the master branch that recast provides.
    esprima: esprima,

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
