// JSBin 编译器 - 函数和复合类型编译（聚合模块）
// 导入并组合所有函数相关的编译器

import { VReg } from "../../vm/index.js";
import { Type, inferType } from "../core/types.js";

// 导入拆分的模块
import { BuiltinMethodCompiler } from "./builtin_methods.js";
import { DataStructureCompiler } from "./data_structures.js";
import { ClosureCompiler } from "./closures.js";
import { ASYNC_CLOSURE_MAGIC, isAsyncFunction } from "../async/index.js";

// 闭包魔数 - 用于区分普通函数指针和闭包对象
const CLOSURE_MAGIC = 0xc105;

// 函数和复合类型编译方法混入 - 聚合所有函数相关的编译器
export const FunctionCompiler = {
    // 从各模块混入方法
    ...BuiltinMethodCompiler,
    ...DataStructureCompiler,
    ...ClosureCompiler,

    // 推断对象类型（用于方法调用分派）
    inferObjectType(obj) {
        const type = inferType(obj, this.ctx);
        switch (type) {
            case Type.MAP:
                return "Map";
            case Type.SET:
                return "Set";
            case Type.DATE:
                return "Date";
            case Type.REGEXP:
                return "RegExp";
            case Type.ARRAY:
                return "Array";
            case Type.TYPED_ARRAY:
                return "TypedArray";
            case Type.OBJECT:
                return "Object";
            case Type.STRING:
                return "String";
            default:
                return "unknown";
        }
    },

    // 判断表达式是否返回布尔值
    isBooleanExpression(expr) {
        // 比较表达式
        if (expr.type === "BinaryExpression") {
            const op = expr.operator;
            if (["<", ">", "<=", ">=", "==", "===", "!=", "!==", "instanceof", "in"].includes(op)) {
                return true;
            }
        }
        // 逻辑非
        if (expr.type === "UnaryExpression" && expr.operator === "!") {
            return true;
        }
        // 方法调用返回布尔值的情况
        if (expr.type === "CallExpression" && expr.callee.type === "MemberExpression") {
            const methodName = expr.callee.property.name;
            // Map 和 Set 的 has() 和 delete() 返回布尔值
            // Array 的 includes() 返回布尔值
            // RegExp 的 test() 返回布尔值
            if (["has", "delete", "includes", "test"].includes(methodName)) {
                return true;
            }
        }
        return false;
    },

    // 编译函数参数 - 先全部压栈，再统一弹出到参数寄存器
    // 这是因为 VReg.RET 和 VReg.A0 都映射到同一个物理寄存器 (X0/RAX)
    compileCallArguments(args) {
        const argCount = Math.min(args.length, 6);

        // 先编译所有参数并压栈（逆序，因为栈是LIFO）
        for (let i = argCount - 1; i >= 0; i--) {
            this.compileExpression(args[i]);
            this.vm.push(VReg.RET);
        }

        // 再按顺序弹出到参数寄存器
        for (let i = 0; i < argCount; i++) {
            this.vm.pop(this.vm.getArgReg(i));
        }
    },

    // 编译 async 顶层函数调用
    // 创建协程并返回 Promise
    // 简化版：直接执行函数，将结果包装成 Promise
    compileAsyncFunctionCall(funcName, args) {
        const vm = this.vm;

        // 真正的 async：创建协程并返回 Promise
        vm.lea(VReg.V1, "_user_" + funcName);
        this.compileAsyncCall(VReg.V1, args);
    },

    // 编译闭包调用 - 处理可能是闭包对象或普通函数指针的情况
    // funcReg: 存放函数指针或闭包对象的寄存器
    compileClosureCall(funcReg, args) {
        const vm = this.vm;

        // 保存函数指针/闭包对象到栈
        vm.push(funcReg);

        // 编译参数
        this.compileCallArguments(args);

        // 恢复函数指针/闭包对象到 S0 (callee-saved)
        vm.pop(VReg.S0);

        // 检查是否是 async 闭包（magic == 0xA51C）
        const notAsyncLabel = this.ctx.newLabel("not_async");
        const asyncCallLabel = this.ctx.newLabel("async_call");
        const notClosureLabel = this.ctx.newLabel("not_closure");
        const callLabel = this.ctx.newLabel("do_call");

        // 加载第一个 8 字节（magic）到 S1
        vm.load(VReg.S1, VReg.S0, 0);

        // 先检查是否是 async 闭包
        vm.movImm(VReg.S2, ASYNC_CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jeq(asyncCallLabel);

        // 检查是否是普通闭包（magic == 0xC105）
        vm.movImm(VReg.S2, CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notClosureLabel);

        // 是普通闭包对象：加载真正的函数指针到 S1，S0 保持闭包对象指针
        vm.load(VReg.S1, VReg.S0, 8); // func_ptr
        // S0 作为闭包指针传给函数（通过 S0 寄存器）
        vm.jmp(callLabel);

        // async 闭包调用：创建协程 + 返回 Promise
        vm.label(asyncCallLabel);
        this.compileAsyncClosureCall(args);
        // 返回，RET = Promise
        const asyncDoneLabel = this.ctx.newLabel("async_done");
        vm.jmp(asyncDoneLabel);

        vm.label(notClosureLabel);
        // 不是闭包对象：S0 就是函数指针，复制到 S1
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0); // 清空闭包指针

        vm.label(callLabel);
        // 通过 S1 间接调用（不能用 V6 因为它映射到 X6 = A5+1）
        vm.callIndirect(VReg.S1);

        vm.label(asyncDoneLabel);
    },

    // 编译方法调用 - 类似闭包调用但传递 this
    // funcReg: 存放函数指针或闭包对象的寄存器
    // thisReg: 存放 this 对象的寄存器
    compileMethodCall(funcReg, thisReg, args) {
        const vm = this.vm;

        // 保存 this 和函数指针到栈
        vm.push(thisReg);
        vm.push(funcReg);

        // 编译参数
        this.compileCallArguments(args);

        // 恢复函数指针和 this
        vm.pop(VReg.S0); // 函数指针/闭包
        vm.pop(VReg.S3); // this 对象

        // 通过 A5 寄存器传递 this（这是额外的隐藏参数）
        vm.mov(VReg.A5, VReg.S3);

        // 检查是否是闭包
        const notClosureLabel = this.ctx.newLabel("method_not_closure");
        const callLabel = this.ctx.newLabel("method_do_call");

        // 加载 magic
        vm.load(VReg.S1, VReg.S0, 0);
        vm.movImm(VReg.S2, CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notClosureLabel);

        // 是闭包：加载函数指针
        vm.load(VReg.S1, VReg.S0, 8);
        vm.jmp(callLabel);

        vm.label(notClosureLabel);
        // 不是闭包：S0 就是函数指针
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0);

        vm.label(callLabel);
        vm.callIndirect(VReg.S1);
    },

    // 编译 async 闭包调用
    // S0 = async 闭包对象
    // 参数已在 A0-A5 寄存器中
    compileAsyncClosureCall(args) {
        const vm = this.vm;

        // S0 = async 闭包对象
        // 保存第一个参数（如果有）
        if (args && args.length > 0) {
            vm.push(VReg.A0);
        }

        // 加载函数指针
        vm.load(VReg.S1, VReg.S0, 8); // func_ptr
        vm.push(VReg.S0); // 保存闭包指针
        vm.push(VReg.S1); // 保存函数指针

        // 创建协程
        vm.pop(VReg.A0); // func_ptr
        if (args && args.length > 0) {
            // 恢复第一个参数
            vm.load(VReg.A1, VReg.SP, 8); // arg 在栈上
        } else {
            vm.movImm(VReg.A1, 0);
        }
        // closure_ptr = S0 (async 闭包对象)
        vm.mov(VReg.A2, VReg.S0);
        vm.call("_coroutine_create");
        vm.mov(VReg.S2, VReg.RET); // S2 = 协程

        // 将闭包指针存入协程（可选：用于访问捕获变量）
        vm.pop(VReg.S0); // 恢复闭包指针
        // 可在协程中通过 S0 访问闭包

        // 创建 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.S3, VReg.RET); // S3 = Promise

        // 关联协程和 Promise
        vm.store(VReg.S2, 88, VReg.S3); // coro.promise = Promise

        // 将协程加入调度队列
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_scheduler_spawn");

        // 清理栈（如果有参数）
        if (args && args.length > 0) {
            vm.addImm(VReg.SP, VReg.SP, 8);
        }

        // 返回 Promise
        vm.mov(VReg.RET, VReg.S3);
    },

    // 编译函数调用
    compileCallExpression(expr) {
        const callee = expr.callee;

        // 内置函数处理
        if (callee.type === "Identifier") {
            if (callee.name === "print") {
                if (expr.arguments.length > 0) {
                    this.compileExpression(expr.arguments[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_print_value");
                }
                return;
            }

            // sizeof(Type) 或 sizeof(variable) - 获取类型的字节大小
            if (callee.name === "sizeof") {
                if (expr.arguments.length > 0) {
                    const arg = expr.arguments[0];
                    let size = 8; // 默认 8 字节
                    if (arg.type === "Identifier") {
                        // 类型名到字节数的映射
                        const typeSizes = {
                            Int8: 1,
                            Uint8: 1,
                            Int16: 2,
                            Uint16: 2,
                            Float16: 2,
                            Int32: 4,
                            Uint32: 4,
                            Float32: 4,
                            Int64: 8,
                            Uint64: 8,
                            Float64: 8,
                            Int: 8,
                            Float: 8,
                            Number: 8,
                            Boolean: 1,
                            String: 8,
                            Array: 8,
                            Object: 8,
                            Date: 8,
                            Map: 8,
                            Set: 8,
                            RegExp: 8,
                        };

                        // 首先检查是否是类型名
                        if (typeSizes[arg.name] !== undefined) {
                            size = typeSizes[arg.name];
                        } else {
                            // 否则检查变量的类型
                            const varType = this.ctx.getVarType ? this.ctx.getVarType(arg.name) : null;
                            if (varType) {
                                // 从类型字符串获取字节数
                                const typeToSize = {
                                    int8: 1,
                                    uint8: 1,
                                    int16: 2,
                                    uint16: 2,
                                    float16: 2,
                                    int32: 4,
                                    uint32: 4,
                                    float32: 4,
                                    int64: 8,
                                    uint64: 8,
                                    float64: 8,
                                    int: 8,
                                    float: 8,
                                    number: 8,
                                    boolean: 1,
                                    string: 8,
                                    array: 8,
                                    object: 8,
                                    Date: 8,
                                    Map: 8,
                                    Set: 8,
                                    RegExp: 8,
                                };
                                size = typeToSize[varType] || 8;
                            }
                        }
                    }
                    this.vm.movImm(VReg.RET, size);
                }
                return;
            }

            // 检查是否是用户声明的顶层函数 (function foo() {})
            // 但不能是局部变量（嵌套函数声明会存储到局部变量）
            const localOffset = this.ctx.getLocal(callee.name);
            if (this.ctx.hasFunction(callee.name) && localOffset === undefined) {
                const funcDef = this.ctx.functions[callee.name];

                // 检查是否是 async 函数
                if (isAsyncFunction(funcDef)) {
                    // async 函数调用：创建协程并返回 Promise
                    this.compileAsyncFunctionCall(callee.name, expr.arguments);
                    return;
                }

                this.compileCallArguments(expr.arguments);
                this.vm.call("_user_" + callee.name);
                return;
            }

            // 检查是否是外部库函数
            if (this.isExternalSymbol && this.isExternalSymbol(callee.name)) {
                // 获取库信息
                const libInfo = this.getExternalLibInfo(callee.name);
                if (libInfo) {
                    if (libInfo.type === "static") {
                        // 静态库：代码已嵌入
                        // JSBin 编译的静态库使用整数寄存器传递参数，直接调用内部函数
                        this.compileCallArguments(expr.arguments);
                        this.vm.call("_user_" + callee.name);
                    } else {
                        // 动态库：需要遵循 C 调用约定
                        this.compileCallArgumentsForCConvention(expr.arguments);

                        // 确保库已添加到外部动态库列表
                        this.registerExternalLib(libInfo);

                        if (this.os === "windows") {
                            // Windows: 使用 IAT 间接调用
                            // 计算此符号在 IAT 中的槽位
                            // kernel32.dll 占用 slots 0-3，然后有一个 null 终止符在 slot 4
                            // 所以外部 DLL 的第一个符号从 slot 5 开始
                            const baseSlot = 5; // 跳过 kernel32 的 4 个函数 + 1 个 null 终止符
                            let slotOffset = 0;

                            // 计算此符号在外部库中的位置
                            for (const lib of this.externalLibs || []) {
                                for (const sym of lib.symbols || []) {
                                    if (sym === callee.name) {
                                        // 找到了，slotOffset 是相对于 baseSlot 的偏移
                                        this.asm.callIAT(baseSlot + slotOffset);
                                        break;
                                    }
                                    slotOffset++;
                                }
                            }
                        } else {
                            // macOS/Linux: 注册外部符号（dylib ordinal 从 2 开始，1 是 libSystem）
                            const dylibIndex = this.getDylibIndex(libInfo.fullPath);
                            this.asm.registerExternalSymbol(callee.name, dylibIndex);
                            this.vm.call("_" + callee.name);
                        }

                        // 外部函数返回值在 D0/XMM0 中（浮点），需要转换到 X0/RAX
                        this.vm.fmovToInt(VReg.RET, 0);
                    }
                    return;
                }
            }

            // 检查是否是局部变量（函数表达式或嵌套函数声明）
            if (localOffset !== undefined) {
                // 检查是否是装箱变量
                const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(callee.name);
                if (isBoxed) {
                    // 装箱变量：先加载 box 指针，再解引用
                    this.vm.load(VReg.V6, VReg.FP, localOffset);
                    this.vm.load(VReg.V6, VReg.V6, 0);
                } else {
                    // 普通变量：直接加载函数指针/闭包对象
                    this.vm.load(VReg.V6, VReg.FP, localOffset);
                }
                // 使用闭包调用机制
                this.compileClosureCall(VReg.V6, expr.arguments);
                return;
            }
        }

        // 处理成员调用 (obj.method())
        if (callee.type === "MemberExpression") {
            const obj = callee.object;
            const prop = callee.property;

            // console.log
            if (obj.type === "Identifier" && obj.name === "console") {
                if (prop.name === "log") {
                    // 处理多个参数
                    for (let i = 0; i < expr.arguments.length; i++) {
                        const arg = expr.arguments[i];
                        const isLast = i === expr.arguments.length - 1;

                        // 根据参数类型选择打印方法
                        if (arg.type === "Literal") {
                            if (typeof arg.value === "string") {
                                // 字符串字面量
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (typeof arg.value === "number") {
                                // 数字字面量 - 现在是 boxed Number 对象
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_number");
                                } else {
                                    this.vm.call("_print_number_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (typeof arg.value === "boolean") {
                                // 布尔字面量 - 打印 "true" 或 "false"
                                if (arg.value) {
                                    this.vm.lea(VReg.A0, "_str_true");
                                } else {
                                    this.vm.lea(VReg.A0, "_str_false");
                                }
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (arg.value === null) {
                                // null
                                this.vm.lea(VReg.A0, "_str_null");
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (arg.value === undefined) {
                                // undefined
                                this.vm.lea(VReg.A0, "_str_undefined");
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else {
                                // 其他未知字面量
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
                                    this.vm.call("_print_space");
                                }
                            }
                        } else if (arg.type === "Identifier" && arg.name === "undefined") {
                            // undefined 标识符（以防某些解析器这样处理）
                            this.vm.lea(VReg.A0, "_str_undefined");
                            if (isLast) {
                                this.vm.call("_print_str");
                            } else {
                                this.vm.call("_print_str_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (arg.type === "Identifier" && (arg.name === "true" || arg.name === "false")) {
                            // true/false 标识符
                            if (arg.name === "true") {
                                this.vm.lea(VReg.A0, "_str_true");
                            } else {
                                this.vm.lea(VReg.A0, "_str_false");
                            }
                            if (isLast) {
                                this.vm.call("_print_str");
                            } else {
                                this.vm.call("_print_str_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (arg.type === "UnaryExpression" && arg.operator === "-") {
                            // 负数表达式（如 -2.5）- boxed Number
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);
                            if (isLast) {
                                this.vm.call("_print_number");
                            } else {
                                this.vm.call("_print_number_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (this.isBooleanExpression(arg)) {
                            // 返回布尔值的表达式 (如 s.has(), m.has(), 比较表达式等)
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);
                            if (isLast) {
                                this.vm.call("_print_bool");
                            } else {
                                this.vm.call("_print_bool_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else {
                            // 其他表达式（变量、函数调用等）
                            // 使用运行时类型检测的 _print_value
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);
                            if (isLast) {
                                this.vm.call("_print_value");
                            } else {
                                this.vm.call("_print_value_no_nl");
                                this.vm.call("_print_space");
                            }
                        }
                    }
                    return;
                }
            }

            // Math 对象方法
            if (obj.type === "Identifier" && obj.name === "Math") {
                if (this.compileMathMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // Object 静态方法
            if (obj.type === "Identifier" && obj.name === "Object") {
                if (prop.name === "keys") {
                    // Object.keys(obj) -> array
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_keys");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "values") {
                    // Object.values(obj) -> array
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_values");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "entries") {
                    // Object.entries(obj) -> [[key, value], ...]
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_entries");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "assign") {
                    // Object.assign(target, source)
                    if (expr.arguments.length >= 2) {
                        this.compileExpression(expr.arguments[1]);
                        this.vm.push(VReg.RET);
                        this.compileExpression(expr.arguments[0]);
                        this.vm.pop(VReg.A1);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_assign");
                    } else if (expr.arguments.length === 1) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "create") {
                    // Object.create(proto)
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                    } else {
                        this.vm.movImm(VReg.A0, 0);
                    }
                    this.vm.call("_object_create");
                    return;
                }
                if (prop.name === "hasOwn") {
                    // Object.hasOwn(obj, key)
                    if (expr.arguments.length >= 2) {
                        this.compileExpression(expr.arguments[1]);
                        this.vm.push(VReg.RET);
                        this.compileExpression(expr.arguments[0]);
                        this.vm.pop(VReg.A1);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_has");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "getPrototypeOf") {
                    // Object.getPrototypeOf(obj)
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_getPrototypeOf");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "setPrototypeOf") {
                    // Object.setPrototypeOf(obj, proto)
                    if (expr.arguments.length >= 2) {
                        this.compileExpression(expr.arguments[1]);
                        this.vm.push(VReg.RET);
                        this.compileExpression(expr.arguments[0]);
                        this.vm.pop(VReg.A1);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_setPrototypeOf");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
            }

            // Date 静态方法 (Date.now())
            if (obj.type === "Identifier" && obj.name === "Date") {
                if (prop.name === "now") {
                    this.vm.call("_date_now");
                    return;
                }
            }

            // Promise 静态方法 (Promise.resolve(), Promise.reject())
            if (obj.type === "Identifier" && obj.name === "Promise") {
                if (prop.name === "resolve") {
                    // Promise.resolve(value) - 创建已 resolved 的 Promise
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_Promise_resolve");
                    return;
                }
                if (prop.name === "reject") {
                    // Promise.reject(reason) - 创建已 rejected 的 Promise
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_Promise_reject");
                    return;
                }
            }

            // Promise 实例方法
            // p.then(cb) / p.catch(cb)
            if (prop && prop.type === "Identifier" && (prop.name === "then" || prop.name === "catch")) {
                // 只支持单个回调参数
                if (expr.arguments.length > 0) {
                    // 先编译 promise 对象
                    this.compileExpression(obj);
                    this.vm.push(VReg.RET);

                    // 再编译回调（闭包对象或函数指针）
                    this.compileExpression(expr.arguments[0]);
                    this.vm.mov(VReg.A1, VReg.RET);

                    // 调用运行时
                    this.vm.pop(VReg.A0);
                    if (prop.name === "then") {
                        this.vm.call("_promise_then");
                    } else {
                        this.vm.call("_promise_catch");
                    }
                } else {
                    // 没有回调参数：退化为返回原 promise
                    this.compileExpression(obj);
                }
                return;
            }

            // 根据对象类型推断，调用正确的方法
            const objType = this.inferObjectType(obj);

            // String 方法 - 优先检查，因为 slice/indexOf 在字符串和数组中都有
            if (objType === "String") {
                const stringMethods = ["toUpperCase", "toLowerCase", "charAt", "charCodeAt", "trim", "slice", "substring", "indexOf", "concat"];
                if (stringMethods.includes(prop.name)) {
                    if (this.compileStringMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // 数组方法 - Array 和 TypedArray 共享
            if (objType === "Array" || objType === "TypedArray" || objType === "unknown") {
                const arrayMethods = ["push", "pop", "shift", "unshift", "length", "at", "slice", "indexOf", "includes", "forEach", "map", "filter", "reduce"];
                if (arrayMethods.includes(prop.name)) {
                    this.compileArrayMethod(obj, prop.name, expr.arguments);
                    return;
                }
            }

            // Map 方法
            if (objType === "Map") {
                const mapMethods = ["set", "get", "has", "delete", "size", "clear"];
                if (mapMethods.includes(prop.name)) {
                    if (this.compileMapMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // Set 方法
            if (objType === "Set") {
                const setMethods = ["add", "has", "delete", "size", "clear"];
                if (setMethods.includes(prop.name)) {
                    if (this.compileSetMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // Date 方法
            if (objType === "Date") {
                const dateMethods = ["getTime", "toString", "valueOf", "toISOString"];
                if (dateMethods.includes(prop.name)) {
                    if (this.compileDateMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // RegExp 方法
            if (objType === "RegExp") {
                const regexpMethods = ["test", "exec"];
                if (regexpMethods.includes(prop.name)) {
                    if (this.compileRegExpMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // 如果无法确定类型，尝试所有可能的方法（旧的回退逻辑）
            if (objType === "unknown") {
                // String 方法 - 对于未知类型，也尝试字符串方法
                const stringMethods = ["toUpperCase", "toLowerCase", "charAt", "charCodeAt", "trim", "slice", "substring", "indexOf", "concat"];
                if (stringMethods.includes(prop.name)) {
                    if (this.compileStringMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }

                // Map 方法
                const mapMethods = ["set", "get"]; // 只有 Map 独有的方法
                if (mapMethods.includes(prop.name)) {
                    if (this.compileMapMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }

                // Set 方法
                const setOnlyMethods = ["add"]; // 只有 Set 独有的方法
                if (setOnlyMethods.includes(prop.name)) {
                    if (this.compileSetMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }

                // Date 方法
                const dateMethods = ["getTime", "toString", "valueOf"];
                if (dateMethods.includes(prop.name)) {
                    if (this.compileDateMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // 通用对象方法调用 - obj.method(args)
            // 获取方法（闭包或函数指针）并传递 this
            this.compileExpression(obj); // obj -> RET
            this.vm.push(VReg.RET); // 保存 obj 作为 this

            // 获取方法属性
            const propLabel = this.asm.addString(prop.name || prop.value);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.lea(VReg.A1, propLabel);
            this.vm.call("_object_get"); // 获取方法 -> RET

            this.vm.mov(VReg.V6, VReg.RET); // 方法指针/闭包
            this.vm.pop(VReg.V5); // 恢复 obj (this)

            // 使用带 this 的闭包调用
            this.compileMethodCall(VReg.V6, VReg.V5, expr.arguments);
            return;
        }

        // 通用函数调用
        if (callee.type === "Identifier") {
            this.compileCallArguments(expr.arguments);
            this.vm.call("_user_" + callee.name);
        } else {
            // 对于间接调用，先计算 callee，然后使用闭包调用机制
            this.compileExpression(callee);
            this.vm.mov(VReg.V6, VReg.RET);
            this.compileClosureCall(VReg.V6, expr.arguments);
        }
    },
};
