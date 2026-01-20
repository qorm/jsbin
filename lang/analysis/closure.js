// JSBin - 闭包分析模块
// 分析函数表达式中捕获的外部变量

// 检查是否是内置函数或全局对象
export function isBuiltinOrGlobal(name) {
    const builtins = ["print", "console", "Promise", "Uint8Array", "Buffer", "Math", "sleep", "Array", "Object", "String", "Number", "Boolean", "Date", "RegExp", "JSON", "Error", "undefined", "null", "NaN", "Infinity"];
    return builtins.includes(name);
}

// 分析函数表达式中捕获的外部变量
// 返回需要捕获的变量名数组
export function analyzeCapturedVariables(funcExpr, outerLocals, functions) {
    const params = funcExpr.params || [];
    const paramNames = {};
    for (let i = 0; i < params.length; i++) {
        if (params[i].type === "Identifier") {
            paramNames[params[i].name] = true;
        }
    }

    // 收集函数体中声明的局部变量
    const localVars = {};
    collectLocalDeclarations(funcExpr.body, localVars);

    // 收集所有引用的变量
    const referenced = {};
    collectReferencedVariables(funcExpr.body, referenced);

    // 递归收集嵌套函数需要的外部变量
    collectNestedFunctionReferences(funcExpr.body, referenced, { ...paramNames, ...localVars });

    // 找出需要捕获的变量
    const captured = [];
    for (const name in referenced) {
        // 跳过参数和局部变量
        if (paramNames[name]) continue;
        if (localVars[name]) continue;
        // 跳过全局函数和内置函数
        if (functions && functions[name]) continue;
        if (isBuiltinOrGlobal(name)) continue;

        // 检查是否在外部作用域中
        if (outerLocals && outerLocals[name] !== undefined) {
            captured.push(name);
        }
    }

    return captured;
}

// 收集函数体中声明的局部变量
export function collectLocalDeclarations(node, vars) {
    if (!node) return;

    if (node.type === "VariableDeclaration") {
        const decls = node.declarations || [];
        for (let i = 0; i < decls.length; i++) {
            if (decls[i].id && decls[i].id.type === "Identifier") {
                vars[decls[i].id.name] = true;
            }
        }
    } else if (node.type === "BlockStatement") {
        const body = node.body || [];
        for (let i = 0; i < body.length; i++) {
            collectLocalDeclarations(body[i], vars);
        }
    } else if (node.type === "IfStatement") {
        collectLocalDeclarations(node.consequent, vars);
        if (node.alternate) {
            collectLocalDeclarations(node.alternate, vars);
        }
    } else if (node.type === "WhileStatement" || node.type === "DoWhileStatement") {
        collectLocalDeclarations(node.body, vars);
    } else if (node.type === "ForStatement") {
        if (node.init) {
            collectLocalDeclarations(node.init, vars);
        }
        collectLocalDeclarations(node.body, vars);
    } else if (node.type === "ForInStatement" || node.type === "ForOfStatement") {
        if (node.left && node.left.type === "VariableDeclaration") {
            collectLocalDeclarations(node.left, vars);
        }
        collectLocalDeclarations(node.body, vars);
    } else if (node.type === "TryStatement") {
        collectLocalDeclarations(node.block, vars);
        if (node.handler) {
            if (node.handler.param && node.handler.param.type === "Identifier") {
                vars[node.handler.param.name] = true;
            }
            collectLocalDeclarations(node.handler.body, vars);
        }
        if (node.finalizer) {
            collectLocalDeclarations(node.finalizer, vars);
        }
    } else if (node.type === "SwitchStatement") {
        const cases = node.cases || [];
        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            for (let j = 0; j < c.consequent.length; j++) {
                collectLocalDeclarations(c.consequent[j], vars);
            }
        }
    }
}

// 收集引用的变量
export function collectReferencedVariables(node, referenced) {
    if (!node) return;

    if (node.type === "Identifier") {
        referenced[node.name] = true;
        return;
    }

    // 不进入嵌套函数
    if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration") {
        return;
    }

    // 对象属性的 key 不算引用
    if (node.type === "MemberExpression" && !node.computed) {
        collectReferencedVariables(node.object, referenced);
        return;
    }

    if (node.type === "Property" && !node.computed) {
        collectReferencedVariables(node.value, referenced);
        return;
    }

    // 递归遍历子节点
    for (const key in node) {
        if (key === "type" || key === "loc" || key === "range" || key === "start" || key === "end") continue;
        const child = node[key];
        if (child && typeof child === "object") {
            if (Array.isArray(child)) {
                for (let i = 0; i < child.length; i++) {
                    if (child[i] && typeof child[i] === "object") {
                        collectReferencedVariables(child[i], referenced);
                    }
                }
            } else {
                collectReferencedVariables(child, referenced);
            }
        }
    }
}

// 递归收集嵌套函数中引用的外部变量
export function collectNestedFunctionReferences(node, referenced, localScope) {
    if (!node) return;

    if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration") {
        // 对于嵌套函数，收集它引用但不在它自己局部作用域中的变量
        const nestedParams = {};
        if (node.params) {
            for (let i = 0; i < node.params.length; i++) {
                if (node.params[i].type === "Identifier") {
                    nestedParams[node.params[i].name] = true;
                }
            }
        }

        const nestedLocals = {};
        collectLocalDeclarations(node.body, nestedLocals);

        const nestedReferenced = {};
        collectReferencedVariables(node.body, nestedReferenced);

        // 递归处理更深层的嵌套
        const nestedLocalScope = { ...nestedParams, ...nestedLocals };
        collectNestedFunctionReferences(node.body, nestedReferenced, nestedLocalScope);

        // 找出嵌套函数引用但不在它自己作用域中的变量
        for (const name in nestedReferenced) {
            if (nestedParams[name]) continue;
            if (nestedLocals[name]) continue;
            // 如果这个变量也不在当前函数的局部作用域中，说明它需要从更外层捕获
            if (!localScope[name]) {
                referenced[name] = true;
            }
        }
        return; // 不继续遍历函数体
    }

    // 递归遍历子节点
    for (const key in node) {
        if (key === "type" || key === "loc" || key === "range") continue;
        const child = node[key];
        if (child && typeof child === "object") {
            if (Array.isArray(child)) {
                for (let i = 0; i < child.length; i++) {
                    collectNestedFunctionReferences(child[i], referenced, localScope);
                }
            } else {
                collectNestedFunctionReferences(child, referenced, localScope);
            }
        }
    }
}

// 分析哪些变量需要被共享（被嵌套函数捕获）
export function analyzeSharedVariables(func) {
    const sharedVars = new Set();

    // 收集当前函数的局部变量和参数
    const params = func.params || [];
    const localVars = {};

    for (let i = 0; i < params.length; i++) {
        if (params[i].type === "Identifier") {
            localVars[params[i].name] = true;
        }
    }
    collectLocalDeclarations(func.body, localVars);

    // 遍历函数体，查找嵌套函数（表达式和声明）
    function visit(node) {
        if (!node) return;

        if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration") {
            // 分析这个嵌套函数捕获了哪些变量
            const captured = analyzeCapturedVariables(node, localVars, null);
            for (const name of captured) {
                sharedVars.add(name);
            }
            return; // 不继续深入嵌套函数
        }

        for (const key in node) {
            if (key === "type" || key === "loc" || key === "range") continue;
            const child = node[key];
            if (child && typeof child === "object") {
                if (Array.isArray(child)) {
                    for (let i = 0; i < child.length; i++) {
                        visit(child[i]);
                    }
                } else {
                    visit(child);
                }
            }
        }
    }

    visit(func.body);
    return sharedVars;
}

// 分析程序顶层：哪些变量会被顶层函数声明捕获
// 这与 analyzeSharedVariables 不同，因为顶层函数声明是在主程序作用域外定义的
// 但它们可以访问主程序中的变量
export function analyzeTopLevelSharedVariables(ast) {
    const sharedVars = new Set();

    // 收集主程序中的局部变量（非函数声明语句）
    const mainLocalVars = {};
    for (const stmt of ast.body) {
        if (stmt.type !== "FunctionDeclaration") {
            collectLocalDeclarations(stmt, mainLocalVars);
        }
    }

    // 分析每个顶层函数声明捕获了哪些主程序变量
    for (const stmt of ast.body) {
        if (stmt.type === "FunctionDeclaration") {
            const captured = analyzeCapturedVariables(stmt, mainLocalVars, null);
            for (const name of captured) {
                sharedVars.add(name);
            }
        }
    }

    return sharedVars;
}
