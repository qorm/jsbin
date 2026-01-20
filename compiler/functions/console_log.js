// JSBin 编译器 - console.log 处理
// 抽取 console.log 编译逻辑，减少 functions.js 体积

import { VReg } from "../../vm/index.js";

export const ConsoleLogCompiler = {
    // 返回 true 表示已处理 console.log
    compileConsoleLogCall(expr, obj, prop) {
        if (!(obj && obj.type === "Identifier" && obj.name === "console")) {
            return false;
        }
        if (!(prop && prop.name === "log")) {
            return false;
        }

        // 处理多个参数
        for (let i = 0; i < expr.arguments.length; i++) {
            const arg = expr.arguments[i];
            const isLast = i === expr.arguments.length - 1;

            // 根据参数类型选择打印方法
            if (arg.type === "Literal") {
                if (typeof arg.value === "string") {
                    // 字符串字面量 - compileExpression 返回 NaN-boxed string
                    // 需要先 unbox 得到 char* 指针再传给 _print_str
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_js_unbox"); // 提取 char* 指针
                    if (isLast) {
                        this.vm.call("_print_str");
                    } else {
                        this.vm.call("_print_str_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (typeof arg.value === "number") {
                    // 数字字面量
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    if (isLast) {
                        this.vm.call("_print_number");
                    } else {
                        this.vm.call("_print_number_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (typeof arg.value === "boolean") {
                    // 布尔字面量
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
                // undefined 标识符
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
                // 负数表达式
                this.compileExpression(arg);
                this.vm.mov(VReg.A0, VReg.RET);
                if (isLast) {
                    this.vm.call("_print_number");
                } else {
                    this.vm.call("_print_number_no_nl");
                    this.vm.call("_print_space");
                }
            } else if (this.isBooleanExpression(arg)) {
                // 返回布尔值的表达式
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

        return true;
    },
};
