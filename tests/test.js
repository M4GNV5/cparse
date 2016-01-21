var fs = require("fs");
var parse = require("./../cparse.js");
var files = ["./simple.c", "./readme.c"];

for(var i = 0; i < files.length; i++)
{
	var src = fs.readFileSync(files[i]).toString();
	var ast = parse(src);
	fs.writeFileSync(files[i] + ".ast.json", JSON.stringify(ast, undefined, 4));
}
