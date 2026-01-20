// JSBin 编译器 - 语句编译
// 编译各类 JavaScript 语句

import { VReg } from "../../vm/index.js";
import { Type, inferType, isCompatible, typeName } from "../core/types.js";

// Box 对象布局：存储被捕获变量的包装对象
// +0: 实际值
const BOX_VALUE_OFFSET = 0;
const BOX_SIZE = 8;

// 语句编译方法混入
export const StatementCompiler = {
    // 编译语句
    compileStatement(stmt) {
        switch (stmt.type) {
            case "ExpressionStatement":
                this.compileExpression(stmt.expression);
                break;
            case "VariableDeclaration":
                this.compileVariableDeclaration(stmt);
                break;
            case "ReturnStatement":
                this.compileReturnStatement(stmt);
                break;
            case "IfStatement":
                this.compileIfStatement(stmt);
                break;
            case "WhileStatement":
                this.compileWhileStatement(stmt);
                break;
            case "ForStatement":
                this.compileForStatement(stmt);
                break;
            case "ForOfStatement":
                this.compileForOfStatement(stmt);
                break;
            case "ForInStatement":
                this.compileForInStatement(stmt);
                break;
            case "DoWhileStatement":
                this.compileDoWhileStatement(stmt);
                break;
            case "BlockStatement":
                this.compileBlockStatement(stmt);
                break;
            case "BreakStatement":
                this.compileBreakStatement(stmt);
                break;
            case "ContinueStatement":
                this.compileContinueStatement(stmt);
                break;
            case "SwitchStatement":
                this.compileSwitchStatement(stmt);
                break;
            case "TryStatement":
                this.compileTryStatement(stmt);
                break;
            case "ThrowStatement":
                this.compileThrowStatement(stmt);
                break;
            case "FunctionDeclaration":
                // 嵌套函数声明：编译为函数表达式并存储到局部变量
                this.compileNestedFunctionDeclaration(stmt);
                break;
            case "ImportLibDeclaration":
                // 动态库导入声明
                this.compileImportLibDeclaration(stmt);
                break;
            case "ClassDeclaration":
                // 类声明
                this.compileClassDeclaration(stmt);
                break;
            case "EmptyStatement":
                // 空语句，不需要处理
                break;
            default:
                console.warn("Unhandled statement type:", stmt.type);
        }
    },

    // 编译块语句
    compileBlockStatement(stmt) {
        const saved = this.ctx.enterScope();
        for (const s of stmt.body) {
            this.compileStatement(s);
        }
        this.ctx.leaveScope(saved);
    },

    // 编译变量声明
    compileVariableDeclaration(stmt) {
        const kind = stmt.kind; // var, let, const, int

        for (const decl of stmt.declarations) {
            if (decl.id.type === "Identifier") {
                const name = decl.id.name;

                // 推断类型
                let varType = Type.UNKNOWN;
                if (decl.init) {
                    varType = inferType(decl.init, this.ctx);
                    // 记录初始化表达式（用于 MemberExpression 类型推断）
                    this.ctx.varInitExprs[name] = decl.init;
                }

                // var 声明：如果变量已存在，复用它
                let offset = this.ctx.getLocal(name);
                if (offset === undefined) {
                    offset = this.ctx.allocLocal(name, varType);
                } else {
                    // 变量已存在，更新类型（但检查兼容性）
                    const existingType = this.ctx.getVarType(name);
                    if (existingType !== Type.UNKNOWN && varType !== Type.UNKNOWN) {
                        if (!isCompatible(varType, existingType)) {
                            console.warn(`Type warning: Cannot redeclare '${name}' as ${typeName(varType)}, was ${typeName(existingType)}`);
                        }
                    }
                    if (varType !== Type.UNKNOWN) {
                        this.ctx.setVarType(name, varType);
                    }
                }

                // 检查这个变量是否需要装箱（会被闭包捕获）
                const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(name);

                // 检查这个变量是否被顶层函数捕获（需要存储到全局位置）
                const globalLabel = this.ctx.getMainCapturedVar(name);

                if (needsBox) {
                    // 为这个变量创建一个 box 对象
                    this.vm.movImm(VReg.A0, BOX_SIZE);
                    this.vm.call("_alloc");
                    // box 指针存储到局部变量
                    this.vm.store(VReg.FP, offset, VReg.RET);

                    // 如果被顶层函数捕获，也把 box 指针存到全局位置
                    if (globalLabel) {
                        this.vm.lea(VReg.V2, globalLabel);
                        this.vm.store(VReg.V2, 0, VReg.RET);
                    }

                    if (decl.init) {
                        // 编译初始值
                        this.vm.push(VReg.RET); // 保存 box 指针
                        this.compileExpressionWithType(decl.init, varType);
                        this.vm.pop(VReg.V1); // 恢复 box 指针
                        // 将值存入 box
                        this.vm.store(VReg.V1, BOX_VALUE_OFFSET, VReg.RET);
                    } else {
                        // 初始化为 0
                        this.vm.movImm(VReg.V1, 0);
                        this.vm.store(VReg.RET, BOX_VALUE_OFFSET, VReg.V1);
                    }
                } else {
                    if (decl.init) {
                        this.compileExpressionWithType(decl.init, varType);
                        this.vm.store(VReg.FP, offset, VReg.RET);
                    }
                }
            }
        }
    },

    // 编译嵌套函数声明
    // 嵌套函数声明会被编译为函数表达式并存储到局部变量
    compileNestedFunctionDeclaration(stmt) {
        if (!stmt.id || stmt.id.type !== "Identifier") {
            return;
        }

        const name = stmt.id.name;

        // 分配局部变量（如果还没有）
        let offset = this.ctx.getLocal(name);
        if (offset === undefined) {
            offset = this.ctx.allocLocal(name);
        }

        // 检查是否需要装箱
        const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(name);

        // 将函数声明转换为函数表达式编译
        const funcExpr = {
            type: "FunctionExpression",
            params: stmt.params,
            body: stmt.body,
            id: stmt.id,
            async: stmt.async, // 保留 async 标志
        };

        this.compileFunctionExpression(funcExpr);

        if (needsBox) {
            // 创建 box 并存储函数指针
            this.vm.mov(VReg.V1, VReg.RET); // 保存函数指针/闭包
            this.vm.movImm(VReg.A0, BOX_SIZE);
            this.vm.call("_alloc");
            this.vm.store(VReg.FP, offset, VReg.RET); // 存储 box 指针
            this.vm.store(VReg.RET, BOX_VALUE_OFFSET, VReg.V1); // 存入函数指针
        } else {
            this.vm.store(VReg.FP, offset, VReg.RET);
        }
    },

    // 编译返回语句
    compileReturnStatement(stmt) {
        if (stmt.argument) {
            this.compileExpression(stmt.argument);
        } else {
            this.vm.movImm(VReg.RET, 0);
        }
        this.vm.jmp(this.ctx.returnLabel);
    },

    // 编译 if 语句
    compileIfStatement(stmt) {
        const elseLabel = this.ctx.newLabel("else");
        const endLabel = this.ctx.newLabel("endif");

        this.compileExpression(stmt.test);
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(stmt.alternate ? elseLabel : endLabel);

        this.compileStatement(stmt.consequent);

        if (stmt.alternate) {
            this.vm.jmp(endLabel);
            this.vm.label(elseLabel);
            this.compileStatement(stmt.alternate);
        }

        this.vm.label(endLabel);
    },

    // 编译 while 语句
    compileWhileStatement(stmt) {
        const loopLabel = this.ctx.newLabel("while");
        const endLabel = this.ctx.newLabel("endwhile");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = loopLabel;

        this.vm.label(loopLabel);
        this.compileExpression(stmt.test);
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(endLabel);

        this.compileStatement(stmt.body);
        this.vm.jmp(loopLabel);

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 for 语句
    compileForStatement(stmt) {
        const loopLabel = this.ctx.newLabel("for");
        const updateLabel = this.ctx.newLabel("for_update");
        const endLabel = this.ctx.newLabel("endfor");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = updateLabel;

        if (stmt.init) {
            if (stmt.init.type === "VariableDeclaration") {
                this.compileVariableDeclaration(stmt.init);
            } else {
                this.compileExpression(stmt.init);
            }
        }

        this.vm.label(loopLabel);

        if (stmt.test) {
            this.compileExpression(stmt.test);
            this.vm.cmpImm(VReg.RET, 0);
            this.vm.jeq(endLabel);
        }

        this.compileStatement(stmt.body);

        this.vm.label(updateLabel);
        if (stmt.update) {
            this.compileExpression(stmt.update);
        }

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 for...of 语句
    compileForOfStatement(stmt) {
        const loopLabel = this.ctx.newLabel("forof");
        const endLabel = this.ctx.newLabel("endforof");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = loopLabel;

        // 计算数组，保存到 S0
        this.compileExpression(stmt.right);
        this.vm.mov(VReg.S0, VReg.RET);

        // 索引变量 i = 0，保存到 S1
        this.vm.movImm(VReg.S1, 0);

        // 获取数组长度，保存到 S2
        this.vm.load(VReg.S2, VReg.S0, 0);

        // 获取迭代变量名
        let varName = null;
        if (stmt.left.type === "VariableDeclaration" && stmt.left.declarations.length > 0) {
            const decl = stmt.left.declarations[0];
            if (decl.id.type === "Identifier") {
                varName = decl.id.name;
            }
        } else if (stmt.left.type === "Identifier") {
            varName = stmt.left.name;
        }

        // 分配迭代变量
        const varOffset = varName ? this.ctx.allocLocal(varName) : null;

        this.vm.label(loopLabel);

        // 检查 i < length
        this.vm.cmp(VReg.S1, VReg.S2);
        this.vm.jge(endLabel);

        // 获取 array[i]
        this.vm.mov(VReg.V0, VReg.S1);
        this.vm.shlImm(VReg.V0, VReg.V0, 3);
        this.vm.addImm(VReg.V0, VReg.V0, 8);
        this.vm.add(VReg.V0, VReg.S0, VReg.V0);
        this.vm.load(VReg.RET, VReg.V0, 0);

        // 存储到迭代变量
        if (varOffset !== null) {
            this.vm.store(VReg.FP, varOffset, VReg.RET);
        }

        // 编译循环体
        this.compileStatement(stmt.body);

        // i++
        this.vm.addImm(VReg.S1, VReg.S1, 1);
        this.vm.jmp(loopLabel);

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 for...in 语句
    compileForInStatement(stmt) {
        const loopLabel = this.ctx.newLabel("forin");
        const endLabel = this.ctx.newLabel("endforin");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = loopLabel;

        // 计算对象/数组，保存到 S0
        this.compileExpression(stmt.right);
        this.vm.mov(VReg.S0, VReg.RET);

        // 索引变量 i = 0，保存到 S1
        this.vm.movImm(VReg.S1, 0);

        // 获取长度，保存到 S2
        this.vm.load(VReg.S2, VReg.S0, 0);

        // 获取迭代变量名
        let varName = null;
        if (stmt.left.type === "VariableDeclaration" && stmt.left.declarations.length > 0) {
            const decl = stmt.left.declarations[0];
            if (decl.id.type === "Identifier") {
                varName = decl.id.name;
            }
        } else if (stmt.left.type === "Identifier") {
            varName = stmt.left.name;
        }

        // 分配迭代变量
        const varOffset = varName ? this.ctx.allocLocal(varName) : null;

        this.vm.label(loopLabel);

        // 检查 i < length
        this.vm.cmp(VReg.S1, VReg.S2);
        this.vm.jge(endLabel);

        // for...in 返回索引
        this.vm.mov(VReg.RET, VReg.S1);

        // 存储到迭代变量
        if (varOffset !== null) {
            this.vm.store(VReg.FP, varOffset, VReg.RET);
        }

        // 编译循环体
        this.compileStatement(stmt.body);

        // i++
        this.vm.addImm(VReg.S1, VReg.S1, 1);
        this.vm.jmp(loopLabel);

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 do-while 语句
    compileDoWhileStatement(stmt) {
        const loopLabel = this.ctx.newLabel("dowhile");
        const endLabel = this.ctx.newLabel("enddowhile");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = loopLabel;

        this.vm.label(loopLabel);
        this.compileStatement(stmt.body);

        this.compileExpression(stmt.test);
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(loopLabel);

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 break 语句
    compileBreakStatement(stmt) {
        if (this.ctx.breakLabel) {
            this.vm.jmp(this.ctx.breakLabel);
        }
    },

    // 编译 continue 语句
    compileContinueStatement(stmt) {
        if (this.ctx.continueLabel) {
            this.vm.jmp(this.ctx.continueLabel);
        }
    },

    // 编译 switch 语句
    compileSwitchStatement(stmt) {
        const endLabel = this.ctx.newLabel("switch_end");
        const cases = stmt.cases || [];

        // 保存 break 标签
        const savedBreak = this.ctx.breakLabel;
        this.ctx.breakLabel = endLabel;

        // 编译 discriminant，保存到 callee-saved 寄存器
        this.compileExpression(stmt.discriminant);
        this.vm.mov(VReg.S0, VReg.RET);

        // 生成每个 case 的标签
        const caseLabels = [];
        let defaultLabel = null;

        for (let i = 0; i < cases.length; i++) {
            if (cases[i].test === null) {
                defaultLabel = this.ctx.newLabel("case_default");
                caseLabels.push(defaultLabel);
            } else {
                caseLabels.push(this.ctx.newLabel("case_" + i));
            }
        }

        // 比较并跳转
        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            if (c.test !== null) {
                // 对于数字字面量的 case，直接使用整数比较
                // 因为 discriminant 存储的是原始整数值
                if (c.test.type === "Literal" && typeof c.test.value === "number") {
                    this.vm.movImm(VReg.V1, Math.trunc(c.test.value));
                } else {
                    this.compileExpression(c.test);
                    this.vm.mov(VReg.V1, VReg.RET);
                }
                this.vm.cmp(VReg.S0, VReg.V1);
                this.vm.jeq(caseLabels[i]);
            }
        }

        // 跳转到 default 或结束
        if (defaultLabel) {
            this.vm.jmp(defaultLabel);
        } else {
            this.vm.jmp(endLabel);
        }

        // 生成 case 代码
        for (let i = 0; i < cases.length; i++) {
            this.vm.label(caseLabels[i]);
            for (const s of cases[i].consequent) {
                this.compileStatement(s);
            }
        }

        this.vm.label(endLabel);
        this.ctx.breakLabel = savedBreak;
    },

    // 编译 try 语句
    compileTryStatement(stmt) {
        // 简化实现：直接执行 try 块，忽略异常处理
        this.compileStatement(stmt.block);

        if (stmt.finalizer) {
            this.compileStatement(stmt.finalizer);
        }
    },

    // 编译 throw 语句
    compileThrowStatement(stmt) {
        // 简化实现：调用 exit
        if (stmt.argument) {
            this.compileExpression(stmt.argument);
        }
        this.vm.movImm(VReg.A0, 1);
        if (this.arch === "arm64") {
            this.vm.syscall(this.os === "linux" ? 93 : 1);
        } else {
            this.vm.syscall(this.os === "linux" ? 60 : 0x2000001);
        }
    },

    // 编译类声明
    // JavaScript 类在运行时主要是：
    // 1. 一个构造函数
    // 2. prototype 对象上的方法
    // 3. 静态方法和字段
    compileClassDeclaration(stmt) {
        const className = stmt.id.name;
        const superClass = stmt.superClass;
        const labelId = this.nextLabelId();

        // 为类分配局部变量槽位（存储类信息对象地址）
        const classOffset = this.ctx.allocLocal(className);

        // 收集类成员
        let constructor = null;
        const instanceMethods = [];
        const staticMethods = [];
        const instanceFields = [];
        const staticFields = [];
        const privateFields = [];
        const privateMethods = [];

        for (const member of stmt.body) {
            if (member.type === "MethodDefinition") {
                if (member.kind === "constructor") {
                    constructor = member;
                } else if (member.static) {
                    staticMethods.push(member);
                } else {
                    instanceMethods.push(member);
                }
            } else if (member.type === "PropertyDefinition") {
                const isPrivate = member.key.type === "PrivateIdentifier";
                if (isPrivate) {
                    privateFields.push(member);
                } else if (member.static) {
                    staticFields.push(member);
                } else {
                    instanceFields.push(member);
                }
            }
        }

        // 生成标签
        const constructorLabel = `_class_${className}_${labelId}`;
        const constructorEndLabel = `_class_${className}_end_${labelId}`;
        const protoLabel = `_class_${className}_proto_${labelId}`;

        // 跳过类代码区域
        this.vm.jmp(constructorEndLabel);

        // ========== 生成构造函数 ==========
        this.vm.label(constructorLabel);
        this.vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        const savedCtx = this.ctx;
        this.ctx = this.ctx.clone(className);
        this.ctx.locals = {};
        this.ctx.localOffset = 0;
        this.ctx.inClass = true;
        this.ctx.className = className;
        this.ctx.superClass = superClass ? superClass.name : null;
        this.ctx.returnLabel = `_class_${className}_return_${labelId}`;

        // 保存 this (A0) 到 __this
        const thisOffset = this.ctx.allocLocal("__this");
        this.vm.store(VReg.FP, thisOffset, VReg.A0);

        // 初始化实例字段（在构造函数体之前）
        for (const field of instanceFields) {
            const fieldName = field.key.name || field.key.value;
            if (field.value) {
                // 保存 this
                this.vm.push(VReg.A0);
                // 编译字段初始值
                this.compileExpression(field.value);
                this.vm.mov(VReg.V1, VReg.RET);
                this.vm.pop(VReg.A0);
                // 设置字段: this[fieldName] = value
                this.vm.mov(VReg.A0, VReg.A0);
                this.vm.lea(VReg.A1, this.addStringConstant(fieldName));
                this.vm.mov(VReg.A2, VReg.V1);
                this.vm.call("_object_set");
            }
        }

        // 初始化私有字段
        for (let i = 0; i < privateFields.length; i++) {
            const field = privateFields[i];
            const privateName = field.key.name; // #name
            // 私有字段存储在对象的隐藏属性中，使用特殊键名
            if (field.value) {
                this.vm.load(VReg.A0, VReg.FP, thisOffset);
                this.vm.push(VReg.A0);
                this.compileExpression(field.value);
                this.vm.mov(VReg.V1, VReg.RET);
                this.vm.pop(VReg.A0);
                this.vm.mov(VReg.A0, VReg.A0);
                this.vm.lea(VReg.A1, this.addStringConstant("__private_" + privateName));
                this.vm.mov(VReg.A2, VReg.V1);
                this.vm.call("_object_set");
            }
        }

        // 编译构造函数参数
        if (constructor && constructor.value) {
            const params = constructor.value.params || [];
            for (let i = 0; i < params.length; i++) {
                const param = params[i];
                const paramName = param.name || (param.left && param.left.name);
                if (paramName) {
                    const paramOffset = this.ctx.allocLocal(paramName);
                    const argReg = VReg.A0 + i + 1; // A1, A2, ...
                    if (argReg <= VReg.A7) {
                        this.vm.store(VReg.FP, paramOffset, argReg);
                    }
                }
            }

            // 编译构造函数体
            if (constructor.value.body && constructor.value.body.body) {
                for (const bodyStmt of constructor.value.body.body) {
                    this.compileStatement(bodyStmt);
                }
            }
        }

        // 返回 this
        this.vm.label(this.ctx.returnLabel);
        this.vm.load(VReg.RET, VReg.FP, thisOffset);
        this.vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 128);

        // ========== 生成实例方法 ==========
        for (const method of instanceMethods) {
            this.compileClassMethod(className, method, labelId, false);
        }

        // ========== 生成静态方法 ==========
        for (const method of staticMethods) {
            this.compileClassMethod(className, method, labelId, true);
        }

        // 恢复上下文
        this.ctx = savedCtx;

        // ========== 类代码结束点 ==========
        this.vm.label(constructorEndLabel);

        // ========== 创建类信息对象 ==========
        // 分配类信息对象 (存储构造函数地址、prototype 地址等)
        this.vm.movImm(VReg.A0, 256); // 足够存储类信息
        this.vm.call("_alloc");
        this.vm.mov(VReg.S0, VReg.RET); // S0 = 类信息对象

        // 设置类型为 FUNCTION (用于 typeof)
        this.vm.movImm(VReg.V0, 3); // TYPE_CLOSURE/FUNCTION = 3
        this.vm.store(VReg.S0, 0, VReg.V0);

        // 存储构造函数地址
        this.vm.lea(VReg.V0, constructorLabel);
        this.vm.store(VReg.S0, 8, VReg.V0);

        // 创建 prototype 对象
        this.vm.movImm(VReg.A0, 256);
        this.vm.call("_alloc");
        this.vm.mov(VReg.S1, VReg.RET); // S1 = prototype 对象
        this.vm.movImm(VReg.V0, 2); // TYPE_OBJECT = 2
        this.vm.store(VReg.S1, 0, VReg.V0);

        // 存储 prototype 地址到类信息
        this.vm.store(VReg.S0, 16, VReg.S1);

        // 添加实例方法到 prototype
        for (const method of instanceMethods) {
            const methodName = method.key.name || method.key.value;
            const methodLabel = `_class_${className}_${methodName}_${labelId}`;

            this.vm.mov(VReg.A0, VReg.S1); // prototype 对象
            this.vm.lea(VReg.A1, this.addStringConstant(methodName));
            this.vm.lea(VReg.A2, methodLabel);
            this.vm.call("_object_set");
        }

        // 添加静态方法到类对象
        for (const method of staticMethods) {
            const methodName = method.key.name || method.key.value;
            const methodLabel = `_class_${className}_static_${methodName}_${labelId}`;

            this.vm.mov(VReg.A0, VReg.S0); // 类对象
            this.vm.lea(VReg.A1, this.addStringConstant(methodName));
            this.vm.lea(VReg.A2, methodLabel);
            this.vm.call("_object_set");
        }

        // 初始化静态字段
        for (const field of staticFields) {
            const fieldName = field.key.name || field.key.value;
            if (field.value) {
                this.vm.push(VReg.S0);
                this.compileExpression(field.value);
                this.vm.mov(VReg.V1, VReg.RET);
                this.vm.pop(VReg.S0);
                this.vm.mov(VReg.A0, VReg.S0);
                this.vm.lea(VReg.A1, this.addStringConstant(fieldName));
                this.vm.mov(VReg.A2, VReg.V1);
                this.vm.call("_object_set");
            }
        }

        // 存储类对象到局部变量
        this.vm.store(VReg.FP, classOffset, VReg.S0);
    },

    // 编译类方法
    compileClassMethod(className, method, labelId, isStatic) {
        const methodName = method.key.name || method.key.value;
        const prefix = isStatic ? "static_" : "";
        const methodLabel = `_class_${className}_${prefix}${methodName}_${labelId}`;
        const returnLabel = `${methodLabel}_return`;

        this.vm.label(methodLabel);
        this.vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        const savedCtx = this.ctx;
        this.ctx = this.ctx.clone(`${className}.${methodName}`);
        this.ctx.locals = {};
        this.ctx.localOffset = 0;
        this.ctx.inClass = true;
        this.ctx.className = className;
        this.ctx.returnLabel = returnLabel;

        // 保存 this (A0)
        const thisOffset = this.ctx.allocLocal("__this");
        this.vm.store(VReg.FP, thisOffset, VReg.A0);

        // 处理参数
        const params = method.value.params || [];
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            const paramName = param.name || (param.left && param.left.name);
            if (paramName) {
                const paramOffset = this.ctx.allocLocal(paramName);
                const argReg = VReg.A0 + i + 1;
                if (argReg <= VReg.A7) {
                    this.vm.store(VReg.FP, paramOffset, argReg);
                }
            }
        }

        // 编译方法体
        if (method.value.body && method.value.body.body) {
            for (const bodyStmt of method.value.body.body) {
                this.compileStatement(bodyStmt);
            }
        }

        // 默认返回 undefined
        this.vm.movImm(VReg.RET, 0);
        this.vm.label(returnLabel);
        this.vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);

        this.ctx = savedCtx;
    },
};
