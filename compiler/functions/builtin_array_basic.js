// JSBin 编译器 - 数组基础方法编译
// 编译 push, pop, slice, indexOf, includes 等数组方法

import { VReg } from "../../vm/index.js";

// 数组基础方法编译 Mixin
export const ArrayBasicCompiler = {
    // 编译数组方法
    compileArrayMethod(arrayExpr, method, args) {
        // push 方法特殊处理：需要更新数组引用（因为扩容可能重新分配）
        if (method === "push") {
            if (args.length > 0) {
                // 编译数组表达式
                this.compileExpression(arrayExpr);
                this.vm.push(VReg.RET);
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A1, VReg.RET);
                this.vm.pop(VReg.A0);
                this.vm.call("_array_push");

                // 如果数组是标识符，更新该变量（因为扩容可能返回新指针）
                if (arrayExpr.type === "Identifier") {
                    const offset = this.ctx.getLocal(arrayExpr.name);
                    if (offset !== undefined) {
                        // 检查是否是装箱变量
                        const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(arrayExpr.name);
                        if (isBoxed) {
                            // 装箱变量：更新 box 的内容
                            this.vm.load(VReg.V0, VReg.FP, offset); // 加载 box 指针
                            this.vm.store(VReg.V0, 0, VReg.RET); // 写入新值
                        } else {
                            // 普通变量：直接更新栈上的值
                            this.vm.store(VReg.FP, offset, VReg.RET);
                        }
                    }
                }
            }
            return;
        }

        this.compileExpression(arrayExpr);

        switch (method) {
            case "pop":
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_array_pop");
                break;
            case "length":
                this.vm.load(VReg.RET, VReg.RET, 0);
                break;
            case "at":
                // arr.at(index) - 支持负索引
                // 注意：index 应该是整数
                if (args.length > 0) {
                    this.vm.push(VReg.RET); // 保存数组指针
                    this.compileExpressionAsInt(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // index (int)
                    this.vm.pop(VReg.A0); // arr
                    this.vm.call("_array_at");
                }
                break;
            case "slice":
                // arr.slice(start, end?)
                // 注意：start 和 end 应该是整数索引
                this.vm.push(VReg.RET);
                if (args.length >= 1) {
                    this.compileExpressionAsInt(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // start (int)
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                if (args.length >= 2) {
                    this.vm.push(VReg.A1);
                    this.compileExpressionAsInt(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET); // end (int)
                    this.vm.pop(VReg.A1);
                } else {
                    this.vm.movImm(VReg.A2, -1); // -1 表示到末尾
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_slice");
                break;
            case "indexOf":
                // arr.indexOf(value) -> Number 对象
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_indexOf");
                    // 装箱返回值为 Number 对象
                    this.boxIntAsNumber(VReg.RET);
                }
                break;
            case "includes":
                // arr.includes(value) -> 返回 _js_true 或 _js_false
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_includes");
                    // 转换为布尔单例
                    const trueLabel = `_includes_true_${this.nextLabelId()}`;
                    const doneLabel = `_includes_done_${this.nextLabelId()}`;
                    this.vm.cmpImm(VReg.RET, 0);
                    this.vm.jne(trueLabel);
                    this.vm.lea(VReg.V0, "_js_false");
                    this.vm.load(VReg.RET, VReg.V0, 0);
                    this.vm.jmp(doneLabel);
                    this.vm.label(trueLabel);
                    this.vm.lea(VReg.V0, "_js_true");
                    this.vm.load(VReg.RET, VReg.V0, 0);
                    this.vm.label(doneLabel);
                }
                break;
            case "forEach":
                // arr.forEach(callback) - 编译时展开循环
                if (args.length > 0) {
                    this.compileArrayForEach(arrayExpr, args[0]);
                }
                break;
            case "map":
                // arr.map(callback) -> new array
                if (args.length > 0) {
                    this.compileArrayMap(arrayExpr, args[0]);
                }
                break;
            case "filter":
                // arr.filter(callback) -> new array
                if (args.length > 0) {
                    this.compileArrayFilter(arrayExpr, args[0]);
                }
                break;
            case "reduce":
                // arr.reduce(callback, initialValue?)
                if (args.length > 0) {
                    this.compileArrayReduce(arrayExpr, args[0], args[1]);
                }
                break;
            case "shift":
                // arr.shift() - 移除第一个元素
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_array_shift");
                break;
            case "unshift":
                // arr.unshift(value) - 在开头添加元素
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_unshift");
                    // 更新数组引用（可能扩容）
                    if (arrayExpr.type === "Identifier") {
                        const offset = this.ctx.getLocal(arrayExpr.name);
                        if (offset !== undefined) {
                            const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(arrayExpr.name);
                            if (isBoxed) {
                                this.vm.load(VReg.V0, VReg.FP, offset);
                                this.vm.store(VReg.V0, 0, VReg.RET);
                            } else {
                                this.vm.store(VReg.FP, offset, VReg.RET);
                            }
                        }
                    }
                }
                break;
            case "concat":
                // arr.concat(arr2) - 连接两个数组
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_concat");
                }
                break;
            case "join":
                // arr.join(separator?) - 连接为字符串
                this.vm.push(VReg.RET);
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_comma");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_join");
                break;
            case "reverse":
                // arr.reverse() - 原地反转
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_array_reverse");
                break;
            case "fill":
                // arr.fill(value, start?, end?)
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    if (args.length >= 2) {
                        this.vm.push(VReg.A1);
                        this.compileExpressionAsInt(args[1]);
                        this.vm.mov(VReg.A2, VReg.RET); // start
                        this.vm.pop(VReg.A1);
                    } else {
                        this.vm.movImm(VReg.A2, 0);
                    }
                    if (args.length >= 3) {
                        this.vm.push(VReg.A1);
                        this.vm.push(VReg.A2);
                        this.compileExpressionAsInt(args[2]);
                        this.vm.mov(VReg.A3, VReg.RET); // end
                        this.vm.pop(VReg.A2);
                        this.vm.pop(VReg.A1);
                    } else {
                        this.vm.movImm(VReg.A3, -1); // -1 表示到末尾
                    }
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_fill");
                }
                break;
            case "lastIndexOf":
                // arr.lastIndexOf(value) -> Number 对象
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_lastIndexOf");
                    // 装箱返回值为 Number 对象
                    this.boxIntAsNumber(VReg.RET);
                }
                break;
            case "find":
                // arr.find(callback) -> element or undefined
                if (args.length > 0) {
                    this.compileArrayFind(arrayExpr, args[0]);
                }
                break;
            case "findIndex":
                // arr.findIndex(callback) -> index or -1
                if (args.length > 0) {
                    this.compileArrayFindIndex(arrayExpr, args[0]);
                }
                break;
            case "some":
                // arr.some(callback) -> boolean
                if (args.length > 0) {
                    this.compileArraySome(arrayExpr, args[0]);
                }
                break;
            case "every":
                // arr.every(callback) -> boolean
                if (args.length > 0) {
                    this.compileArrayEvery(arrayExpr, args[0]);
                }
                break;
            default:
                break;
        }
    },
};
