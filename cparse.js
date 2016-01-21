var cparse = (function()
{
	const ops = {
		"=": 1,
		"+=": 1,
		"-=": 1,
		"*=": 1,
		"/=": 1,
		"%=": 1,
		">>=": 1,
		"<<=": 1,
		"&=": 1,
		"^=": 1,
		"|=": 1,

		"?": 2, //ternary
		":": 2, //ternary

		"||": 3,
		"&&": 4,

		"|": 5,
		"^": 6,
		"&": 7,

		"<": 8,
		">": 8,
		"<=": 8,
		">=": 8,
		"==": 8,
		"!=": 8,

		">>": 9, //shift right
		"<<": 9, //shift left

		"+": 10,
		"-": 10,

		"*": 11,
		"/": 11,
		"%": 11,

		".": 13, //structure member access
		"->": 13 //structure pointer member access
	};

	const prefixedOps = {
		"!": 12, //logical NOT
		"~": 12, //bitwise NOT
		"&": 12, //adress of
		"*": 12, //dereference
		"+": 12, //unary +
		"-": 12, //unary -
		"++": 12, //prefixed ++
		"--": 12, //prefixed --
		"sizeof": 12
	}

	const suffixedOps = {
		"++": 13, //suffixed ++
		"--": 13 //suffixed --
	}

	const stringEscapes = {
		"a": "\a",
		"b": "\b",
		"f": "\f",
		"n": "\n",
		"r": "\r",
		"t": "\t",
		"v": "\v",
		"\\": "\\",
		"'": "'",
		"\"": "\"",
		"?": "\?"
	};

	return function(src)
	{
		var index = 0;
		var curr = src[index];

		return parseRoot();

		function parseRoot()
		{
			var stmts = [];

			while(curr)
			{
				skipBlanks();
				if(lookahead("struct"))
				{
					var stmt = {type: "StructDefinition", member: []};
					stmt.name = readIdentifier();
					consume("{");

					while(definitionIncoming())
					{
						var def = readDefinition();
						stmt.member.push(def);
						consume(";");
					}

					consume("}");
					stmts.push(stmt);
				}
				else if(lookahead("enum"))
				{
					throw "enums not yet supported";
				}
				else if(lookahead("typedef"))
				{
					throw "typedef not yet supported";
				}
				else if(definitionIncoming())
				{
					var def = readDefinition();

					if(lookahead("(")) //function definition
					{
						def.arguments = parseArgumentDefinition();

						if(lookahead(";"))
						{
							def.type = "FunctionDefinition";
						}
						else
						{
							def.type = "FunctionDeclaration";
							def.body = parseBody();
						}
						stmts.push(def);
					}
					else // global variable definition
					{
						if(lookahead("="))
							def.value = parseExpression(";");
						else
							consume(";");

						def.type = "GlobalVariableDeclaration";
						stmts.push(def);
					}
				}
				else
				{
					unexpected("struct, enum, typdef, extern, FunctionDeclaration or VariableDeclaration");
				}
			}

			return stmts;
		}

		function parseArgumentDefinition()
		{
			var args = [];
			while(definitionIncoming())
			{
				args.push(readDefinition());

				if(lookahead(")"))
					return args;
				consume(",");
			}
			consume(")");
			return args;
		}

		function parseBody()
		{
			var stmts = [];
			consume("{");

			while(!(curr == "}" || !curr))
			{
				stmts.push(parseStatement());
			}

			consume("}");
			return stmts;
		}

		function parseStatement()
		{
			if(lookahead("return"))
			{
				return {
					type: "ReturnStatement",
					value: parseExpression(";")
				};
			}
			else if(lookahead("if"))
			{
				consume("(");
				var stmt = {type: "IfStatement"};
				stmt.condition = parseExpression(")");
				stmt.body = parseBody();

				if(lookahead("else"))
					stmt.else = parseBody();

				return stmt;
			}
			else if(lookahead("while"))
			{
				consume("(");
				return {
					type: "WhileStatement",
					condition: parseExpression(")"),
					body: parseBody()
				};
			}
			else if(lookahead("do"))
			{
				var stmt = {type: "DoWhileStatement"};
				stmt.body = parseBody();
				consume("while");
				consume("(");
				stmt.condition = parseExpression(")");
				consume(";");

				return stmt;
			}
			else if(lookahead("for"))
			{
				var stmt = {type: "ForStatement"};

				consume("(");
				stmt.init = parseStatement();
				stmt.condition = parseExpression(";");
				stmt.step = parseExpression(")");
				stmt.body = parseBody();

				return stmt;
			}
			else if(definitionIncoming())
			{
				var def = readDefinition();
				if(lookahead("="))
					def.value = parseExpression(";");
				else
					consume(";");

				def.type = "VariableDeclaration";
				return def;
			}
			else
			{
				return {
					type: "ExpressionStatement",
					expression: parseExpression(";")
				};
			}
		}

		function parseExpression(end)
		{
			end = end || [";"];
			end = end instanceof Array ? end : [end];

			var postfix = [];
			var opstack = [];

			var wasOp = true;

			function getPrecendence(op)
			{
				if(typeof op == "string")
					return ops[op];
				else if(typeof op == "object" && op.type == "PrefixOperator")
					return prefixedOps[op.operator];
				else if(typeof op == "object" && op.type == "SuffixOperator")
					return suffixedOps[op.operator];
			}
			function handleOp(op)
			{
				if(wasOp && prefixedOps[op])
					op = {type: "PrefixOperator", operator: op};
				else if(!wasOp && suffixedOps[op])
					op = {type: "SuffixOperator", operator: op};
				else
					wasOp = true;

				var prec = getPrecendence(op);
				while(opstack[0] && getPrecendence(opstack[0]) > prec)
				{
					postfix.push(opstack[0]);
					opstack.splice(0, 1);
				}

				opstack.unshift(op);
			}

			var _ops = Object.keys(ops);
			_ops.sort(function(a, b)
			{
				return b.length - a.length;
			});

			while(end.indexOf(curr) == -1 && curr)
			{
				if(wasOp)
				{
					var isPrefixOp = false;
					for(var op in prefixedOps)
					{
						if(lookahead(op))
						{
							handleOp(op);
							isPrefixOp = true;
							break;
						}
					}
					if(isPrefixOp)
						continue;

					if(lookahead("("))
					{
						var expr = parseExpression(")");
						postfix = postfix.concat(expr);
					}
					else if(lookahead("{"))
					{
						var entries = [];

						if(!lookahead("}"))
						{
							while(curr && src[index - 1] != "}")
							{
								entries.push(parseExpression([",", "}"]));
								skipBlanks();
							}
						}

						postfix.push({
							type: "Literal",
							value: entries
						});
					}
					else if(lookahead("'"))
					{
						var val = curr.charCodeAt(0);
						next(true);
						consume("'");

						postfix.push({
							type: "Literal",
							source: "CharCode",
							value: val
						});
					}
					else if(stringIncoming())
					{
						postfix.push({
							type: "Literal",
							value: readString()
						});
					}
					else if(numberIncoming())
					{
						postfix.push({
							type: "Literal",
							value: readNumber()
						});
					}
					else if(identifierIncoming())
					{
						var val = readIdentifier();

						if(lookahead("("))
						{
							var args = [];
							skipBlanks();

							if(!lookahead(")"))
							{
								while(curr && src[index - 1] != ")")
								{
									args.push(parseExpression([",", ")"]));
									skipBlanks();
								}
							}

							postfix.push({
								type: "CallExpression",
								name: val,
								arguments: args
							});
						}
						else
						{
							postfix.push({
								type: "Identifier",
								value: val
							});
						}
					}
					else
					{
						unexpected("Number or unary Operator");
					}

					wasOp = false;
				}
				else
				{
					(function()
					{
						if(lookahead("["))
						{
							var expr = parseExpression("]");
							postfix.push({
								type: "IndexExpression",
								index: expr
							});
							return;
						}

						for(var op in suffixedOps)
						{
							if(lookahead(op))
							{
								handleOp(op);
								return;
							}
						}

						for(var i = 0; i < _ops.length; i++)
						{
							if(lookahead(_ops[i]))
							{
								handleOp(_ops[i]);
								return;
							}
						}

						unexpected("Operator");
					})();
				}
			}

			if(!curr)
				unexpected(end.join(", "));
			next();

			for(var i = 0; i < opstack.length; i++)
			{
				postfix.push(opstack[i]);
			}

			postfix.reverse();
			var i = 0;

			function opArgCount(op)
			{
				if(op == "?")
					return 3;
				else if(ops[op])
					return 2;
				else if(op.type == "SuffixOperator" || op.type == "PrefixOperator" || op.type == "IndexExpression")
					return 1;
				return 0;
			}

			console.dir(postfix);

			function toTree()
			{
				var count = opArgCount(postfix[i]);
				var ast = postfix[i];
				i++;

				if(count == 1)
				{
					ast.type = ast.type.replace("Operator", "Expression");
					ast.value = toTree();
				}
				else if(count == 2)
				{
					ast = {type: "BinaryExpression", operator: ast};
					ast.right = toTree();
					ast.left = toTree();
				}
				else if(count == 3)
				{
					ast = {type: "TernaryExpression"};
					if(postfix[i] != ":")
						throw new Error("Error parsing ternary expression");
					i++;

					ast.right = toTree();
					ast.left = toTree();
					ast.condition = toTree();
				}

				return ast;
			}

			return toTree();
		}

		function definitionIncoming()
		{
			if(identifierIncoming())
			{
				var _index = index;

				readIdentifier();
				while(lookahead("*"))
				{}
				if(identifierIncoming())
				{
					index = _index;
					curr = src[index];
					return true;
				}

				index = _index;
				curr = src[index];
			}
			return false;
		}
		function readDefinition()
		{
			var def = {
				type: "Definition",
				modifier: [],
				pointer: 0
			};

			while(identifierIncoming())
			{
				def.modifier.push(readIdentifier());
			}

			if(lookahead("*"))
			{
				def.pointer = 1;
				while(lookahead("*"))
				{
					def.pointer++;
				}
				def.name = readIdentifier();
			}
			else
			{
				def.name = def.modifier.splice(def.modifier.length - 1, 1)[0];
			}

			while(lookahead("[]"))
				def.pointer++;

			if(def.modifier.length == 0)
				unexpected("Type");
			def.valueType = def.modifier.splice(def.modifier.length - 1, 1)[0];

			return def;
		}

		function stringIncoming()
		{
			return curr && curr == "\"";
		}
		function readString()
		{
			var val = [];
			next();
			while(curr && curr != "\"")
			{
				if(curr == "\\")
				{
					next(true);
					if(!stringEscapes[curr])
						unexpected("escape sequence");
					val.push(stringEscapes[curr]);
				}
				else
				{
					val.push(curr);
				}
				next(true);
			}

			if(!lookahead("\""))
				unexpected("\"");

			return val.join("");
		}

		function numberIncoming()
		{
			return curr && /[0-9]/.test(curr);
		}
		function readNumber()
		{
			var val = read(/[0-9\.]/, "Number", /[0-9]/);
			return parseFloat(val);
		}

		function identifierIncoming()
		{
			return curr && /[A-Za-z_]/.test(curr);
		}
		function readIdentifier()
		{
			return read(/[A-Za-z0-9_]/, "Identifier", /[A-Za-z_]/);
		}

		function read(reg, expected, startreg)
		{
			startreg = startreg || reg;

			if(!startreg.test(curr))
				unexpected(expected);

			var val = [curr];
			next(true);

			while(curr && reg.test(curr))
			{
				val.push(curr);
				next(true);
			}

			skipBlanks();

			return val.join("");
		}

		function getPos(i)
		{
			i = i || index;
			var pos = {
				line: src.substring(0, index).split("\n").length,
				column: index - src.lastIndexOf("\n", index)
			};
			return pos;
		}

		function unexpected(expected)
		{
			var pos = getPos();
			var _curr = JSON.stringify(curr || "EOF");

			var msg = [
				"Expecting",
				expected,
				"got",
				_curr,
				"at line",
				pos.line,
				"column",
				pos.column
			].join(" ");
			throw new Error(msg);
		}

		function lookahead(str)
		{
			var _index = index;
			for(var i = 0; i < str.length; i++)
			{
				if(curr != str[i])
				{
					index = _index;
					curr = src[index];
					return false;
				}
				next(true);
			}
			skipBlanks();
			return true;
		}

		function consume(str)
		{
			for(var i = 0; i < str.length; i++)
			{
				if(curr != str[i])
					unexpected(str);
				next();
			}
		}

		function skipBlanks()
		{
			if(/[\s\n]/.test(curr))
				next();
		}

		function next(includeSpaces)
		{
			includeSpaces = includeSpaces || false;

			index++;
			curr = src[index];

			if(includeSpaces)
				return;

			while(curr && /[\s\n]/.test(curr))
			{
				index++;
				curr = src[index];
			}

			curr = curr;
		}
	};
})();

if(typeof module == "object")
	module.exports = cparse;
