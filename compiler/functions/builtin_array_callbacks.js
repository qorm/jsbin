// asm.js 编译器 - 数组回调方法编译
// 编译 forEach, map, filter, reduce, find, some, every 等数组回调方法

import { VReg } from "../../vm/index.js";

// 数组回调方法编译 Mixin
export const ArrayCallbackCompiler = {
    // 编译 arr.forEach(callback) - 支持 Array 和 TypedArray
    compileArrayForEach(arrayExpr, callbackExpr) {
        // 先编译数组和回调
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__forEach_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__forEach_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 获取数组长度：先 unbox NaN-boxed 数组，然后从 offset 0 读取 length
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_js_unbox"); // unbox 得到裸数组指针
        this.vm.load(VReg.V0, VReg.RET, 8); // 数组 length 在 offset 8（offset 0 是 type）
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

    // 闭包调用的核心逻辑（S0 = NaN-boxed 函数 JSValue，参数已在 A0-A5 中）
    // NaN-boxing: 函数 tag = 0x7FFF
    // 注意：此函数会保护 A0-A2 参数
    emitClosureCallAfterSetup(argcN = 3) {
        const vm = this.vm;

        const notClosureLabel = this.ctx.newLabel("cb_not_closure");
        const callLabel = this.ctx.newLabel("cb_do_call");
        const callLabel_loadFn = this.ctx.newLabel("cb_load_fn");
        const doneLabel = this.ctx.newLabel("cb_done");

        // 检查是否是 NaN-boxed 函数 (tag = 0x7FFF)
        vm.shrImm(VReg.S1, VReg.S0, 48);
        vm.movImm(VReg.S2, 0x7fff);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notClosureLabel);

        // 是 NaN-boxed 函数：unbox 获取闭包指针
        // 保存参数 A0-A2 到栈（_js_unbox 会破坏它们）
        vm.push(VReg.A0);
        vm.push(VReg.A1);
        vm.push(VReg.A2);

        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // S0 = unboxed 指针

        // 恢复参数
        vm.pop(VReg.A2);
        vm.pop(VReg.A1);
        vm.pop(VReg.A0);

        // unbox 后可能是闭包对象（magic 0xC105，函数指针在 +8）
        // 或纯函数指针（0x7FFF 装箱的 _user_ 标签地址）
        vm.load(VReg.S1, VReg.S0, 0);
        vm.movImm(VReg.S2, 0xc105);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jeq(callLabel_loadFn);
        // 纯函数指针：S0 本身就是函数地址
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0);
        vm.jmp(callLabel);
        vm.label(callLabel_loadFn);
        vm.load(VReg.S1, VReg.S0, 8); // 闭包函数指针在 +8
        vm.jmp(callLabel);

        vm.label(notClosureLabel);
        // 非 0x7FFF tag:裸指针(闭包/纯函数)或**装箱 Proxy(0x7FFD)**。先掩码脱壳
        // (裸指针高16=0 恒等;此前对装箱 proxy 带 tag 解引用 [S0+0] 段错 →
        // [1,2].map(proxyCallable) 崩)。
        {
            const rawClosureLabel = this.ctx.newLabel("cb_raw_closure");
            const rawFnLabel = this.ctx.newLabel("cb_raw_fn");
            const rawProxyLabel = this.ctx.newLabel("cb_raw_proxy");
            vm.emitMaskLoad(VReg.S1);
            vm.andMaskReg(VReg.S0, VReg.S0, VReg.S1);
            vm.load(VReg.S1, VReg.S0, 0); // 读 magic/首字
            vm.movImm(VReg.S2, 0xc105);
            vm.cmp(VReg.S1, VReg.S2);
            vm.jne(rawProxyLabel);
            // 是闭包对象：函数指针在 +8，S0 保留为闭包指针（供捕获变量访问）
            vm.load(VReg.S1, VReg.S0, 8);
            vm.jmp(callLabel);
            vm.label(rawProxyLabel);
            // [Proxy 回调] 可调用 Proxy(type@0==8)→ _validate_callable 合成闭包块
            // {0xc105, tramp, proxyRaw}(in/out=S0,A0-A5/S1/S2 保持)→ 按闭包分派。
            vm.movImm(VReg.S2, 8); // TYPE_PROXY
            vm.cmp(VReg.S1, VReg.S2);
            vm.jne(rawFnLabel);
            // _validate_callable 的 proxy 判别要求装箱 0x7FFD 形态(见 methods.js 同注)。
            vm.movImm64(VReg.S2, 0x7ffd000000000000n);
            vm.or(VReg.S0, VReg.S0, VReg.S2);
            vm.call("_validate_callable"); // S0 → 合成闭包块
            vm.load(VReg.S1, VReg.S0, 8);  // tramp 地址
            vm.jmp(callLabel);
            vm.label(rawFnLabel);
            // 纯函数指针
            vm.mov(VReg.S1, VReg.S0);
            vm.movImm(VReg.S0, 0);
        }

        vm.label(callLabel);
        vm.setCallArgcImm(argcN, VReg.V5, VReg.V6); // [argc ABI]
        vm.callIndirect(VReg.S1);

        vm.label(doneLabel);
    },

    // 编译 arr.map(callback) - 支持 Array 和 TypedArray
    compileArrayMap(arrayExpr, callbackExpr) {
        // 编译数组（得到 NaN-boxed JSValue）
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__map_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // NaN-boxing: 检查是否是 TypedArray（通过高 16 位）
        // 普通 Array: 0x7FFE, TypedArray 也走 0x7FFE 但需要其他方式区分
        // 暂时只支持普通 Array，存储类型标记 0
        const typeOffset = this.ctx.allocLocal(`__map_type_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0); // 普通 Array
        this.vm.store(VReg.FP, typeOffset, VReg.V0);

        // 获取数组长度：先 unbox 再从 offset 0 读取
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_js_unbox");
        this.vm.load(VReg.V0, VReg.RET, 8); // 数组 length 在 offset 8（offset 0 是 type）
        const lenOffset = this.ctx.allocLocal(`__map_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V0);

        // 创建新数组：调用 _array_new_with_size(length)
        this.vm.load(VReg.A0, VReg.FP, lenOffset);
        this.vm.call("_array_new_with_size");
        // 返回的是 NaN-boxed 数组
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
        // 编译数组（得到 NaN-boxed JSValue）
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__filter_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // NaN-boxing: 暂时只支持普通 Array
        const typeOffset = this.ctx.allocLocal(`__filter_type_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, typeOffset, VReg.V0);

        // 获取数组长度：先 unbox 再从 offset 0 读取
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_js_unbox");
        this.vm.load(VReg.V0, VReg.RET, 8); // 数组 length 在 offset 8（offset 0 是 type）
        const lenOffset = this.ctx.allocLocal(`__filter_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V0);

        // 创建新数组：调用 _array_new_with_size(length)
        this.vm.load(VReg.A0, VReg.FP, lenOffset);
        this.vm.call("_array_new_with_size");
        // 需要将长度设为 0，因为 filter 会动态添加元素
        // _array_new_with_size 返回的数组 length = A0，我们需要改为 0
        this.vm.mov(VReg.S1, VReg.RET); // 保存 boxed 数组
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_js_unbox"); // unbox 得到裸指针
        this.vm.mov(VReg.V1, VReg.RET); // 保存裸指针到 V1
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.V1, 0, VReg.V0); // 将 length 设为 0
        this.vm.mov(VReg.RET, VReg.S1); // 恢复 boxed 数组

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
        // 使用 _to_boolean 转换为 0 或 1
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(skipLabel);

        // 添加元素到新数组 - 使用 _array_push（支持 NaN-boxing）
        this.vm.label(addLabel);
        this.vm.load(VReg.A0, VReg.FP, newArrOffset); // boxed arr
        this.vm.load(VReg.A1, VReg.FP, elemOffset); // value (JSValue)
        this.vm.call("_array_push");
        // _array_push 返回新数组（可能扩容），更新 newArrOffset
        this.vm.store(VReg.FP, newArrOffset, VReg.RET);

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

        // 获取数组长度：先 unbox 再从 offset 0 读取
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_js_unbox");
        this.vm.load(VReg.V1, VReg.RET, 8); // 数组 length 在 offset 8（用 V1 避免冲突）
        const lenOffset = this.ctx.allocLocal(`__reduce_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V1);

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
        this.emitClosureCallAfterSetup(4);

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

    // 编译 arr.find(callback) -> element or undefined
    compileArrayFind(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__find_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度：先 unbox 再从 offset 0 读取
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_js_unbox");
        this.vm.load(VReg.V1, VReg.RET, 8); // 数组 length 在 offset 8
        const lenOffset = this.ctx.allocLocal(`__find_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V1);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__find_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__find_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__find_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("find_loop");
        const endLabel = this.ctx.newLabel("find_end");
        const foundLabel = this.ctx.newLabel("find_found");
        const returnLabel = this.ctx.newLabel("find_return");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_subscript_get");
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 调用回调: callback(element, index, array)
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);
        this.vm.load(VReg.A0, VReg.FP, elemOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.load(VReg.A2, VReg.FP, arrOffset);
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 如果回调返回 truthy，返回元素
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(foundLabel);

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);
        this.vm.jmp(loopLabel);

        this.vm.label(foundLabel);
        this.vm.load(VReg.RET, VReg.FP, elemOffset);
        this.vm.jmp(returnLabel);

        this.vm.label(endLabel);
        // 未找到，返回 undefined
        this.vm.lea(VReg.RET, "_js_undefined");

        this.vm.label(returnLabel);
    },

    // 编译 arr.findIndex(callback) -> index or -1
    compileArrayFindIndex(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__findIdx_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度：先 unbox 再从 offset 0 读取
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_js_unbox");
        this.vm.load(VReg.V1, VReg.RET, 8); // 数组 length 在 offset 8
        const lenOffset = this.ctx.allocLocal(`__findIdx_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V1);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__findIdx_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__findIdx_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__findIdx_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("findIdx_loop");
        const endLabel = this.ctx.newLabel("findIdx_end");
        const foundLabel = this.ctx.newLabel("findIdx_found");
        const returnLabel = this.ctx.newLabel("findIdx_return");

        this.vm.label(loopLabel);

        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_subscript_get");
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);
        this.vm.load(VReg.A0, VReg.FP, elemOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.load(VReg.A2, VReg.FP, arrOffset);
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(foundLabel);

        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);
        this.vm.jmp(loopLabel);

        this.vm.label(foundLabel);
        this.vm.load(VReg.RET, VReg.FP, idxOffset);
        this.vm.jmp(returnLabel);

        this.vm.label(endLabel);
        this.vm.movImm(VReg.RET, -1);

        this.vm.label(returnLabel);
        // 装箱返回值为 Number 对象
        this.boxIntAsNumber(VReg.RET);
    },

    // 编译 arr.some(callback) -> boolean
    compileArraySome(arrayExpr, callbackExpr) {
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__some_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度：先 unbox 再从 offset 0 读取
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_js_unbox");
        this.vm.load(VReg.V1, VReg.RET, 8); // 数组 length 在 offset 8
        const lenOffset = this.ctx.allocLocal(`__some_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V1);

        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__some_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        const idxOffset = this.ctx.allocLocal(`__some_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        const elemOffset = this.ctx.allocLocal(`__some_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("some_loop");
        const endLabel = this.ctx.newLabel("some_end");
        const trueLabel = this.ctx.newLabel("some_true");
        const returnLabel = this.ctx.newLabel("some_return");

        this.vm.label(loopLabel);

        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_subscript_get");
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);
        this.vm.load(VReg.A0, VReg.FP, elemOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.load(VReg.A2, VReg.FP, arrOffset);
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 回调返回值在 RET，_to_boolean 读 A0——必须先搬（filter/find 都有此步，
        // some 漏了 → _to_boolean 读到脏 A0 恒真 → some 永远返回 true）。
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(trueLabel);

        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);
        this.vm.jmp(loopLabel);

        this.vm.label(trueLabel);
        this.vm.lea(VReg.V0, "_js_true");
        this.vm.load(VReg.RET, VReg.V0, 0);
        this.vm.jmp(returnLabel);

        this.vm.label(endLabel);
        this.vm.lea(VReg.V0, "_js_false");
        this.vm.load(VReg.RET, VReg.V0, 0);

        this.vm.label(returnLabel);
    },

    // 编译 arr.every(callback) -> boolean
    compileArrayEvery(arrayExpr, callbackExpr) {
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__every_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度：先 unbox 再从 offset 0 读取
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_js_unbox");
        this.vm.load(VReg.V1, VReg.RET, 8); // 数组 length 在 offset 8
        const lenOffset = this.ctx.allocLocal(`__every_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.V1);

        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__every_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        const idxOffset = this.ctx.allocLocal(`__every_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        const elemOffset = this.ctx.allocLocal(`__every_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("every_loop");
        const endLabel = this.ctx.newLabel("every_end");
        const falseLabel = this.ctx.newLabel("every_false");
        const returnLabel = this.ctx.newLabel("every_return");

        this.vm.label(loopLabel);

        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_subscript_get");
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);
        this.vm.load(VReg.A0, VReg.FP, elemOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.load(VReg.A2, VReg.FP, arrOffset);
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 回调返回值搬 RET->A0 再 _to_boolean（同 some 的漏搬 bug）
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(falseLabel);

        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);
        this.vm.jmp(loopLabel);

        this.vm.label(falseLabel);
        this.vm.lea(VReg.V0, "_js_false");
        this.vm.load(VReg.RET, VReg.V0, 0);
        this.vm.jmp(returnLabel);

        this.vm.label(endLabel);
        this.vm.lea(VReg.V0, "_js_true");
        this.vm.load(VReg.RET, VReg.V0, 0);

        this.vm.label(returnLabel);
    },
};
