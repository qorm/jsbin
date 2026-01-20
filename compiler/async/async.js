// JSBin 编译器 - 异步函数编译
// 编译 async 函数和 await 表达式

import { VReg } from "../../vm/index.js";

// async 函数魔数 - 标记为异步闭包
export const ASYNC_CLOSURE_MAGIC = 0xa51c;

// 判断 AST 节点是否是 async 函数（兼容 parser 的 async/isAsync 两种属性）
export function isAsyncFunction(node) {
    return node && (node.async === true || node.isAsync === true);
}

// 异步编译器方法混入
export const AsyncCompiler = {
    // 编译 await 表达式
    // await promise 会挂起当前协程直到 promise 完成
    compileAwaitExpression(expr) {
        // 编译被 await 的表达式
        this.compileExpression(expr.argument);
        // RET = Promise 对象

        // 调用 _promise_await
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_promise_await");
        // RET = resolved 值
    },

    // 编译 async 函数调用
    // 创建协程并返回 Promise
    compileAsyncCall(funcPtr, args) {
        const vm = this.vm;

        // 保存函数指针
        vm.push(funcPtr);

        // 编译参数（只支持第一个参数用于简化）
        if (args && args.length > 0) {
            this.compileExpression(args[0]);
            vm.push(VReg.RET);
        } else {
            vm.movImm(VReg.V1, 0);
            vm.push(VReg.V1);
        }

        // 恢复函数指针
        vm.pop(VReg.A1); // arg
        vm.pop(VReg.A0); // func_ptr

        // 创建协程（closure_ptr = 0）
        vm.movImm(VReg.A2, 0);
        vm.call("_coroutine_create");
        vm.push(VReg.RET); // 保存协程指针

        // 创建 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.V3, VReg.RET); // V3 = Promise

        // 将协程与 Promise 关联
        vm.pop(VReg.V4); // V4 = 协程
        vm.store(VReg.V4, 88, VReg.V3); // coro.promise = Promise

        // 将协程加入调度队列
        vm.mov(VReg.A0, VReg.V4);
        vm.call("_scheduler_spawn");

        // 返回 Promise
        vm.mov(VReg.RET, VReg.V3);
    },

    // 检查闭包是否是 async 函数
    // 在 compileClosureCall 中调用
    checkAsyncClosure(closureReg, asyncLabel) {
        const vm = this.vm;

        // 加载 magic
        vm.load(VReg.V1, closureReg, 0);
        vm.movImm(VReg.V2, ASYNC_CLOSURE_MAGIC);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jeq(asyncLabel);
    },

    // 编译 async 函数返回
    // async 函数 return 跳到 returnLabel，由 emitAsyncResolveAndReturnFromRet 处理
    compileAsyncReturn(expr) {
        const vm = this.vm;

        // 编译返回值
        if (expr && expr.argument) {
            this.compileExpression(expr.argument);
        } else {
            vm.movImm(VReg.RET, 0);
        }

        // 跳到 returnLabel，统一处理 resolve + epilogue
        vm.jmp(this.ctx.returnLabel);
    },

    // async 函数返回（RET 已经是返回值）
    // 用于把所有 return 汇聚到 returnLabel 统一处理
    // resolve Promise 后正常 epilogue 返回，由 _coroutine_entry 处理协程结束
    emitAsyncResolveAndReturnFromRet() {
        const vm = this.vm;

        // 保存返回值
        vm.push(VReg.RET);

        // 获取当前协程
        vm.lea(VReg.V1, "_scheduler_current");
        vm.load(VReg.V1, VReg.V1, 0);

        // 获取关联的 Promise
        vm.load(VReg.V2, VReg.V1, 88);

        // 如果有 Promise，resolve 它
        vm.cmpImm(VReg.V2, 0);
        const noPromiseLabel = this.ctx.newLabel("async_ret_no_promise");
        vm.jeq(noPromiseLabel);

        vm.pop(VReg.A1); // 返回值
        vm.push(VReg.A1); // 保留一份
        vm.mov(VReg.A0, VReg.V2);
        vm.call("_promise_resolve");

        vm.label(noPromiseLabel);
        // 恢复返回值，然后正常 epilogue
        vm.pop(VReg.RET);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    },

    // 生成调度器初始化调用
    // 在程序入口处调用
    generateSchedulerInit() {
        this.vm.call("_scheduler_init");
    },

    // 生成调度器运行调用
    // 在程序结束前调用，确保所有协程完成
    generateSchedulerRun() {
        this.vm.call("_scheduler_run");
    },
};
