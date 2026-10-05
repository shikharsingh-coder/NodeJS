const fs = require("fs");
const path = require("path");

// Cache loaded modules
const moduleCache = {};

function myRequire(request) {
  // 1. Resolve the module path
  let filename;

  if (request.startsWith("./") || request.startsWith("../")) {
    filename = path.resolve(request);
  } else {
    throw new Error("Only local modules are supported");
  }
  // 2. Add .js extension if needed
  if (!path.extname(filename)) {
    filename += ".js";
  }
  // 3. Check if module is cached
  if (moduleCache[filename]) {
    return moduleCache[filename].exports;
  }
  // 4. Check if file exists
  if (!fs.existsSync(filename)) {
    throw new Error(`Cannot find module '${request}'`);
  }
  // 5. Create module object
  const module = {
    id: filename,
    filename: filename,
    loaded: false,
    exports: {}
  };
  // Put it in cache BEFORE executing.
  // This is important for circular dependencies.
  moduleCache[filename] = module;
  // 6. Read the source code
  const code = fs.readFileSync(filename, "utf8");
  // 7. Create a module wrapper
  const wrapper = `
    (function (
      module,
      exports,
      require,
      __filename,
      __dirname
    ) {
      ${code}
    });
  `;
  // 8. Convert wrapper string to function
  const moduleFunction = eval(wrapper);
  // 9. Create a require function
  //    specific to this module
  const localRequire = function (request) {
    const modulePath = path.resolve(
      path.dirname(filename),
      request
    );

    return myRequire(modulePath);
  };
  // 10. Execute the module
  moduleFunction(
    module,
    module.exports,
    localRequire,
    filename,
    path.dirname(filename)
  );
  // 11. Mark module as loaded
  module.loaded = true;
  // 12. Return exports
  return module.exports;
}


const math = myRequire("./math.js");

console.log(math.add(2, 3));