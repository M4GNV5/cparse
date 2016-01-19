var cparse = (function()
{
	const EOF = {type: "EOF"};
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

		/*"?": 2, //ternary
		":": 2, //ternary*/

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

		/*".": 9, //structure member access
		"->": 9 //structure pointer member access*/
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
	}

	const suffixedOps = {
		"++": 13, //suffixed ++
		"--": 13 //suffixed --
	}

	return function(src)
	{
		var index = 0;
		var curr = src[index];

		return parseRoot();

		function parseRoot()
		{
			var stmts = [];

			while(curr != EOF)
			{
				if(lookahead("struct"))
				{
					throw "structs not yet supported";
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

			while(!(curr == "}" || curr == EOF))
			{
				stmts.push(parseStatement());
			}

			consume("}");
			return stmts;
		}

		function parseStatement()
		{
			if(lookahead("if"))
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
			else
			{
				return {
					type: "ExpressionStatement",
					expression: parseExpression(";")
				};
			}
		}

		function parseExpression(end, forcePostfix)
		{
			end = end || [";"];
			end = end instanceof Array ? end : [end];

			var postfix = [];
			var opstack = [];

			var wasOp = true;

			function isOp(op)
			{
				if(ops[op] || prefixedOps[op] || suffixedOps[op])
					return true;
				return false;
			}
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
				else if(wasOp)
					unexpected("Number or unary Operator");
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

			while(end.indexOf(curr) == -1 && curr != EOF)
			{
				var nextC = src[index + 1];

				if(isOp(curr + nextC))
				{
					handleOp(curr + nextC);
					next();
					next();
				}
				else if(isOp(curr))
				{
					handleOp(curr);
					next();
				}
				else
				{
					if(curr == "(")
					{
						next();
						var expr = parseExpression(")", true);
						postfix = postfix.concat(expr.postfix);
					}
					else if(curr == "[")
					{
						next();
						var expr = parseExpression("]", true);
						postfix = postfix.concat(expr.postfix);
						postfix.push("[]");
					}
					else if(!wasOp)
					{
						unexpected("Operator");
					}
					else if(numberIncoming())
					{
						postfix.push(readNumber());
					}
					else if(identifierIncoming())
					{
						var val = readIdentifier();

						if(lookahead("("))
						{
							var args = [];

							skipBlanks();
							while(src[index - 1] != ")" && curr != EOF)
							{
								args.push(parseExpression([",", ")"]));
								skipBlanks();
							}
							postfix.push({
								type: "Call",
								name: val,
								arguments: args
							});
						}
						else
						{
							postfix.push(val);
						}
					}
					else
					{
						unexpected("Expression");
					}

					wasOp = false;
				}
			}

			if(curr == EOF)
				unexpected(end.join(", "));
			next();

			for(var i = 0; i < opstack.length; i++)
			{
				postfix.push(opstack[i]);
			}

			if(postfix.length == 1 && !forcePostfix)
			{
				if(typeof postfix[0] == "object")
					return postfix[0];
				else if(typeof postfix[0] == "string")
					return {type: "Identifier", value: postfix[0]};
				else if(typeof postfix[0] == "number")
					return {type: "Literal", value: postfix[0]};
			}

			return {type: "Expression", postfix: postfix};
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
				ptr: 0
			};

			while(identifierIncoming())
			{
				def.modifier.push(readIdentifier());
			}

			if(lookahead("*"))
			{
				def.ptr = 1;
				while(lookahead("*"))
				{
					def.ptr++;
				}
				def.name = readIdentifier();
			}
			else
			{
				def.name = def.modifier.splice(def.modifier.length - 1, 1)[0];
			}

			if(def.modifier.length == 0)
				unexpected("Type");
			def.valueType = def.modifier.splice(def.modifier.length - 1, 1)[0];

			return def;
		}

		function numberIncoming()
		{
			return /[0-9]/.test(curr);
		}
		function readNumber()
		{
			var val = read(/[0-9\.]/, "Number", /[0-9]/);
			return parseFloat(val);
		}

		function identifierIncoming()
		{
			return /[A-Za-z_]/.test(curr);
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

			while(curr != EOF && reg.test(curr))
			{
				val.push(curr);
				next(true);
			}

			skipBlanks();

			return val.join("");
		}

		function unexpected(expected)
		{
			var line = src.substring(0, index).split("\n").length;
			var column = index - src.lastIndexOf("\n", index) + 2;
			var _curr = JSON.stringify(curr);

			var msg = [
				"Expecting",
				expected,
				"got",
				_curr,
				"at line",
				line,
				"column",
				column
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
			curr = src[index] || EOF;

			if(includeSpaces)
				return;

			while(curr && /[\s\n]/.test(curr))
			{
				index++;
				curr = src[index];
			}

			curr = curr || EOF;
		}

		function escapeRegExp(str)
		{
			return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
		}
	};
})();

if(module)
	module.exports = cparse;
