// JSBin 编译器 - 内置类型方法编译
// 编译 Math、Array、Map、Set、Date、RegExp 等内置类型的方法

import { VReg } from "../../vm/index.js";

// 内置方法编译方法混入
export const BuiltinMethodCompiler = {
    // 编译 Math 方法
    compileMathMethod(methodName, args) {
        if (methodName === "floor" || methodName === "ceil" || methodName === "round") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
            }
            return true;
        }

        if (methodName === "abs") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                const negLabel = this.ctx.newLabel("abs_neg");
                const endLabel = this.ctx.newLabel("abs_end");
                this.vm.cmpImm(VReg.RET, 0);
                this.vm.jlt(negLabel);
                this.vm.jmp(endLabel);
                this.vm.label(negLabel);
                this.vm.mov(VReg.V1, VReg.RET);
                this.vm.movImm(VReg.RET, 0);
                this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                this.vm.label(endLabel);
            }
            return true;
        }

        if (methodName === "min" || methodName === "max") {
            if (args.length >= 2) {
                this.compileExpression(args[0]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[1]);
                this.vm.pop(VReg.V1);

                const useFirstLabel = this.ctx.newLabel("minmax_first");
                const endLabel = this.ctx.newLabel("minmax_end");

                this.vm.cmp(VReg.V1, VReg.RET);
                if (methodName === "min") {
                    this.vm.jlt(useFirstLabel);
                } else {
                    this.vm.jgt(useFirstLabel);
                }
                this.vm.jmp(endLabel);
                this.vm.label(useFirstLabel);
                this.vm.mov(VReg.RET, VReg.V1);
                this.vm.label(endLabel);
            }
            return true;
        }

        return false;
    },

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
                this.vm.load(VReg.RET, VReg.RET, 8);
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
                // arr.indexOf(value)
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_indexOf");
                }
                break;
            case "includes":
                // arr.includes(value)
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_includes");
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
            default:
                break;
        }
    },

    // 编译 arr.forEach(callback) - 支持 Array 和 TypedArray
    compileArrayForEach(arrayExpr, callbackExpr) {
        // 先编译数组和回调
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__forEach_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__forEach_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 获取数组长度
        this.vm.load(VReg.V0, VReg.FP, arrOffset);
        this.vm.load(VReg.V0, VReg.V0, 8);
        const lenOffset = this.ctx.allocLocal(`__forEach_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V0);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__forEach_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__forEach_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("forEach_loop");
        const endLabel = this.ctx.newLabel("forEach_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _subscript_get 统一处理 Array 和 TypedArray
        this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.call("_subscript_get");

        // 保存元素值
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 加载闭包并 push
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包到 S0
        this.vm.pop(VReg.S0);

        // 调用闭包
        this.emitClosureCallAfterSetup();

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        this.vm.movImm(VReg.RET, 0); // forEach 返回 undefined
    },

    // 闭包调用的核心逻辑（S0 = 闭包对象，参数已在 A0-A5 中）
    emitClosureCallAfterSetup() {
        const vm = this.vm;
        const CLOSURE_MAGIC = 0xc105;
        const ASYNC_CLOSURE_MAGIC = 0xa51c;

        const notClosureLabel = this.ctx.newLabel("cb_not_closure");
        const callLabel = this.ctx.newLabel("cb_do_call");
        const asyncLabel = this.ctx.newLabel("cb_async");
        const doneLabel = this.ctx.newLabel("cb_done");

        // 加载 magic
        vm.load(VReg.S1, VReg.S0, 0);

        // 检查是否是 async 闭包
        vm.movImm(VReg.S2, ASYNC_CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jeq(asyncLabel);

        // 检查是否是普通闭包
        vm.movImm(VReg.S2, CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notClosureLabel);

        // 是闭包：加载函数指针
        vm.load(VReg.S1, VReg.S0, 8);
        vm.jmp(callLabel);

        vm.label(asyncLabel);
        // async 闭包暂不支持在 forEach 回调中使用
        vm.jmp(doneLabel);

        vm.label(notClosureLabel);
        // 直接是函数指针
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0);

        vm.label(callLabel);
        vm.callIndirect(VReg.S1);

        vm.label(doneLabel);
    },

    // 编译 arr.map(callback) - 支持 Array 和 TypedArray
    compileArrayMap(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__map_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 保存数组类型（用于创建同类型的结果数组）
        this.vm.load(VReg.V0, VReg.RET, 0); // 加载类型标签
        this.vm.andImm(VReg.V0, VReg.V0, 0xff); // 取低 8 位
        const typeOffset = this.ctx.allocLocal(`__map_type_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, typeOffset, VReg.V0);

        // 获取数组长度
        this.vm.load(VReg.V0, VReg.FP, arrOffset);
        this.vm.load(VReg.V0, VReg.V0, 8); // 长度
        const lenOffset = this.ctx.allocLocal(`__map_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V0);

        // 根据类型创建新数组
        // 检查是否是 TypedArray (类型 >= 0x40)
        this.vm.load(VReg.V1, VReg.FP, typeOffset);
        this.vm.cmpImm(VReg.V1, 0x40);
        const createTypedArray = this.ctx.newLabel("map_create_ta");
        const createDone = this.ctx.newLabel("map_create_done");
        this.vm.jge(createTypedArray);

        // 创建普通 Array: 16 + length * 8
        this.vm.load(VReg.V0, VReg.FP, lenOffset);
        this.vm.shl(VReg.A0, VReg.V0, 3);
        this.vm.addImm(VReg.A0, VReg.A0, 16);
        this.vm.call("_alloc");
        this.vm.mov(VReg.S1, VReg.RET);
        this.vm.load(VReg.V0, VReg.FP, lenOffset);
        this.vm.movImm(VReg.V1, 1); // TYPE_ARRAY
        this.vm.store(VReg.S1, 0, VReg.V1);
        this.vm.store(VReg.S1, 8, VReg.V0);
        this.vm.mov(VReg.RET, VReg.S1);
        this.vm.jmp(createDone);

        // 创建 TypedArray
        this.vm.label(createTypedArray);
        this.vm.load(VReg.A0, VReg.FP, typeOffset); // type
        this.vm.load(VReg.A1, VReg.FP, lenOffset); // length
        this.vm.call("_typed_array_new");

        this.vm.label(createDone);
        const newArrOffset = this.ctx.allocLocal(`__map_newarr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, newArrOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__map_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__map_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__map_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("map_loop");
        const endLabel = this.ctx.newLabel("map_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _subscript_get 统一处理
        this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.call("_subscript_get");

        // 保存元素值
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 存储结果到新数组 - 使用 _subscript_set 统一处理
        this.vm.mov(VReg.A2, VReg.RET); // value (返回值)
        this.vm.load(VReg.A0, VReg.FP, newArrOffset); // arr
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.call("_subscript_set");

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 返回新数组
        this.vm.load(VReg.RET, VReg.FP, newArrOffset);
    },

    // 编译 arr.filter(callback) - 支持 Array 和 TypedArray
    compileArrayFilter(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__filter_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 保存数组类型
        this.vm.load(VReg.V0, VReg.RET, 0);
        this.vm.andImm(VReg.V0, VReg.V0, 0xff);
        const typeOffset = this.ctx.allocLocal(`__filter_type_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, typeOffset, VReg.V0);

        // 获取数组长度
        this.vm.load(VReg.V0, VReg.FP, arrOffset);
        this.vm.load(VReg.V0, VReg.V0, 8);
        const lenOffset = this.ctx.allocLocal(`__filter_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V0);

        // 根据类型创建新数组（最大可能大小）
        this.vm.load(VReg.V1, VReg.FP, typeOffset);
        this.vm.cmpImm(VReg.V1, 0x40);
        const createTypedArray = this.ctx.newLabel("filter_create_ta");
        const createDone = this.ctx.newLabel("filter_create_done");
        this.vm.jge(createTypedArray);

        // 创建普通 Array
        this.vm.load(VReg.V0, VReg.FP, lenOffset);
        this.vm.shl(VReg.A0, VReg.V0, 3);
        this.vm.addImm(VReg.A0, VReg.A0, 16);
        this.vm.call("_alloc");
        this.vm.mov(VReg.S1, VReg.RET);
        this.vm.movImm(VReg.V1, 1);
        this.vm.store(VReg.S1, 0, VReg.V1);
        this.vm.movImm(VReg.V1, 0);
        this.vm.store(VReg.S1, 8, VReg.V1);
        this.vm.mov(VReg.RET, VReg.S1);
        this.vm.jmp(createDone);

        // 创建 TypedArray
        this.vm.label(createTypedArray);
        this.vm.load(VReg.A0, VReg.FP, typeOffset);
        this.vm.load(VReg.A1, VReg.FP, lenOffset);
        this.vm.call("_typed_array_new");
        // 重置长度为 0 (会在添加时递增)
        // 注意：_typed_array_new 后 V0 可能被修改，需要重新设置
        this.vm.mov(VReg.V0, VReg.RET); // 保存新数组指针
        this.vm.movImm(VReg.V1, 0);
        this.vm.store(VReg.V0, 8, VReg.V1);
        this.vm.mov(VReg.RET, VReg.V0); // 恢复 RET

        this.vm.label(createDone);
        const newArrOffset = this.ctx.allocLocal(`__filter_newarr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, newArrOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__filter_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__filter_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__filter_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("filter_loop");
        const addLabel = this.ctx.newLabel("filter_add");
        const skipLabel = this.ctx.newLabel("filter_skip");
        const endLabel = this.ctx.newLabel("filter_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _subscript_get 统一处理
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_subscript_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 检查返回值是否为 truthy
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(skipLabel);

        // 添加元素到新数组 - 使用 _subscript_set 统一处理
        this.vm.label(addLabel);
        this.vm.load(VReg.A0, VReg.FP, newArrOffset); // arr
        this.vm.load(VReg.A1, VReg.A0, 8); // 当前长度作为 index
        this.vm.load(VReg.A2, VReg.FP, elemOffset); // value

        // 存储元素
        this.vm.call("_subscript_set");

        // 更新长度（在存储之后）
        this.vm.load(VReg.V0, VReg.FP, newArrOffset);
        this.vm.load(VReg.V1, VReg.V0, 8); // 读取当前长度
        this.vm.addImm(VReg.V1, VReg.V1, 1);
        this.vm.store(VReg.V0, 8, VReg.V1);

        this.vm.label(skipLabel);
        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 返回新数组
        this.vm.load(VReg.RET, VReg.FP, newArrOffset);
    },

    // 编译 arr.reduce(callback, initialValue?)
    compileArrayReduce(arrayExpr, callbackExpr, initialValueExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__reduce_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度
        this.vm.load(VReg.V0, VReg.RET, 8);
        const lenOffset = this.ctx.allocLocal(`__reduce_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V0);

        // 初始化累加器
        const accOffset = this.ctx.allocLocal(`__reduce_acc_${this.nextLabelId()}`);
        if (initialValueExpr) {
            this.compileExpression(initialValueExpr);
            this.vm.store(VReg.FP, accOffset, VReg.RET);
        } else {
            // 无初始值时，使用第一个元素作为初始值
            // 使用 _subscript_get 统一处理 Array 和 TypedArray
            this.vm.load(VReg.A0, VReg.FP, arrOffset);
            this.vm.movImm(VReg.A1, 0);
            this.vm.call("_subscript_get");
            this.vm.store(VReg.FP, accOffset, VReg.RET);
        }

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__reduce_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引（如果有初始值从 0 开始，否则从 1 开始）
        const idxOffset = this.ctx.allocLocal(`__reduce_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, initialValueExpr ? 0 : 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储（在循环外分配）
        const elemOffset = this.ctx.allocLocal(`__reduce_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("reduce_loop");
        const endLabel = this.ctx.newLabel("reduce_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _subscript_get 统一处理 Array 和 TypedArray
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_subscript_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数: callback(accumulator, currentValue, index, array)
        this.vm.load(VReg.A0, VReg.FP, accOffset); // accumulator
        this.vm.load(VReg.A1, VReg.FP, elemOffset); // currentValue
        this.vm.load(VReg.A2, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A3, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 更新累加器
        this.vm.store(VReg.FP, accOffset, VReg.RET);

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 返回累加器
        this.vm.load(VReg.RET, VReg.FP, accOffset);
    },

    // 编译 Map 方法调用
    // obj.set(key, value), obj.get(key), obj.has(key), obj.delete(key), obj.size
    compileMapMethod(obj, method, args) {
        // 先编译 Map 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 Map 指针

        switch (method) {
            case "set":
                // map.set(key, value)
                if (args.length >= 2) {
                    this.compileExpression(args[1]);
                    this.vm.push(VReg.RET); // 保存 value
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A2); // value
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_set");
                    return true;
                }
                break;

            case "get":
                // map.get(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_get");
                    return true;
                }
                break;

            case "has":
                // map.has(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_has");
                    return true;
                }
                break;

            case "delete":
                // map.delete(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_delete");
                    return true;
                }
                break;

            case "size":
                // map.size - 直接从头部读取 length 字段 (统一头部结构 +8)
                this.vm.pop(VReg.RET);
                this.vm.load(VReg.RET, VReg.RET, 8);
                return true;

            case "clear":
                // map.clear()
                this.vm.pop(VReg.A0);
                // 清空 Map：size = 0, head = null
                this.vm.movImm(VReg.V1, 0);
                this.vm.store(VReg.A0, 8, VReg.V1); // size = 0
                this.vm.store(VReg.A0, 16, VReg.V1); // head = null
                this.vm.mov(VReg.RET, VReg.A0);
                return true;
        }

        this.vm.pop(VReg.RET); // 恢复栈
        return false;
    },

    // 编译 Set 方法调用
    // obj.add(value), obj.has(value), obj.delete(value), obj.size
    compileSetMethod(obj, method, args) {
        // 先编译 Set 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 Set 指针

        switch (method) {
            case "add":
                // set.add(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_add");
                    return true;
                }
                break;

            case "has":
                // set.has(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_has");
                    return true;
                }
                break;

            case "delete":
                // set.delete(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_delete");
                    return true;
                }
                break;

            case "size":
                // set.size - 直接从头部读取 length 字段 (统一头部结构 +8)
                this.vm.pop(VReg.RET);
                this.vm.load(VReg.RET, VReg.RET, 8);
                return true;

            case "clear":
                // set.clear()
                this.vm.pop(VReg.A0);
                this.vm.call("_set_clear");
                return true;
        }

        this.vm.pop(VReg.RET); // 恢复栈
        return false;
    },

    // 编译 Date 方法调用
    // obj.getTime(), obj.toString(), obj.valueOf(), obj.toISOString()
    compileDateMethod(obj, method, args) {
        // 先编译 Date 对象
        this.compileExpression(obj);
        this.vm.mov(VReg.A0, VReg.RET);

        switch (method) {
            case "getTime":
            case "valueOf":
                // date.getTime() / date.valueOf()
                this.vm.call("_date_getTime");
                return true;

            case "toString":
                // date.toString()
                this.vm.call("_date_toString");
                return true;

            case "toISOString":
                // date.toISOString() - 输出 ISO 8601 格式
                this.vm.call("_date_toISOString");
                return true;
        }

        return false;
    },

    // 编译 RegExp 方法调用
    // obj.test(str), obj.exec(str)
    compileRegExpMethod(obj, method, args) {
        // 先编译 RegExp 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 regexp 对象

        // 编译参数（输入字符串）
        if (args.length > 0) {
            this.compileExpression(args[0]);
            this.vm.mov(VReg.A1, VReg.RET);
        } else {
            // 默认空字符串
            this.vm.lea(VReg.A1, "_str_empty");
        }

        // 恢复 regexp 对象到 A0
        this.vm.pop(VReg.A0);

        switch (method) {
            case "test":
                // regexp.test(str) - 返回布尔值
                this.vm.call("_regexp_test");
                return true;

            case "exec":
                // regexp.exec(str) - 返回结果数组或 null
                this.vm.call("_regexp_exec");
                return true;
        }

        return false;
    },

    // 编译 String 方法调用
    // str.toUpperCase(), str.toLowerCase(), str.charAt(i), str.trim() 等
    compileStringMethod(obj, method, args) {
        // 先编译字符串表达式
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存原始字符串

        switch (method) {
            case "toUpperCase":
                // str.toUpperCase() - 返回新字符串
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_toUpperCase");
                return true;

            case "toLowerCase":
                // str.toLowerCase() - 返回新字符串
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_toLowerCase");
                return true;

            case "charAt":
                // str.charAt(index) - 返回单字符字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 索引是浮点数表示，转为整数 (使用 VM 统一接口)
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.RET, 0);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charAt");
                return true;

            case "charCodeAt":
                // str.charCodeAt(index) - 返回字符编码
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 索引是浮点数表示，转为整数 (使用 VM 统一接口)
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.RET, 0);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charCodeAt");
                return true;

            case "trim":
                // str.trim() - 去除首尾空白
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_trim");
                return true;

            case "slice":
            case "substring":
                // str.slice(start, end) / str.substring(start, end)
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存内容指针

                // 编译 start 参数（需要转换浮点数到整数）
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 使用 VM 统一接口
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.RET, 0);
                    this.vm.push(VReg.RET); // 保存 start
                } else {
                    this.vm.movImm(VReg.V0, 0);
                    this.vm.push(VReg.V0);
                }

                // 编译 end 参数（需要转换浮点数到整数）
                if (args.length > 1) {
                    this.compileExpression(args[1]);
                    // 使用 VM 统一接口
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.RET, 0);
                    this.vm.mov(VReg.A2, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A2, -1); // -1 表示到末尾
                }

                this.vm.pop(VReg.A1); // start
                this.vm.pop(VReg.A0); // str content
                this.vm.call("_str_slice");
                return true;

            case "indexOf":
                // str.indexOf(search) - 返回索引或 -1
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_indexOf");
                return true;

            case "concat":
                // str.concat(other) - 字符串连接
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_strconcat");
                return true;
        }

        // 未处理的方法，弹出栈
        this.vm.pop(VReg.V0);
        return false;
    },
};
