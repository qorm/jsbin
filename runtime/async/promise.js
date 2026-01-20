// JSBin 运行时 - Promise 支持
// 基于协程实现的 Promise

import { VReg } from "../../vm/index.js";

// 闭包魔数（与编译器保持一致）
const CLOSURE_MAGIC = 0xc105;
const ASYNC_CLOSURE_MAGIC = 0xa51c;

// Promise 状态
const PROMISE_PENDING = 0;
const PROMISE_FULFILLED = 1;
const PROMISE_REJECTED = 2;

// Promise 对象内存布局:
// +0:  type (8 bytes) = TYPE_PROMISE (11)
// +8:  status (8 bytes) - pending/fulfilled/rejected
// +16: value (8 bytes) - resolved 值或 rejected 原因
// +24: then_handlers (8 bytes) - then 回调链表头
// +32: catch_handlers (8 bytes) - catch 回调链表头
// +40: waiting_coro (8 bytes) - 等待此 Promise 的协程

// Handler 节点:
// +0: callback (8 bytes) - 回调函数
// +8: next_promise (8 bytes) - then 返回的 Promise
// +16: next (8 bytes) - 下一个 handler

const TYPE_PROMISE = 11;
const PROMISE_SIZE = 48;
const HANDLER_SIZE = 24;

export class PromiseGenerator {
    constructor(vm) {
        this.vm = vm;
        this.arch = vm.arch;
        this.os = vm.platform;
        this._labelId = 0;
    }

    newLabel(prefix) {
        return `_${prefix}_${this._labelId++}`;
    }

    // 调用回调（支持闭包对象或裸函数指针）
    // - callbackReg: 指向闭包对象(堆内) 或 代码段函数指针
    // - argReg: 传给回调的第一个参数
    // 返回值：RET
    emitInvokeCallback1(callbackReg, argReg) {
        const vm = this.vm;

        const directCallLabel = this.newLabel("promise_cb_direct");
        const closureCallLabel = this.newLabel("promise_cb_closure");
        const afterCallLabel = this.newLabel("promise_cb_after");

        // 在堆范围内才尝试读 magic
        vm.lea(VReg.V2, "_heap_base");
        vm.load(VReg.V2, VReg.V2, 0);
        vm.cmp(callbackReg, VReg.V2);
        vm.jlt(directCallLabel);

        vm.lea(VReg.V3, "_heap_ptr");
        vm.load(VReg.V3, VReg.V3, 0);
        vm.cmp(callbackReg, VReg.V3);
        vm.jge(directCallLabel);

        // heap 内：检查是否是 closure magic
        vm.load(VReg.V4, callbackReg, 0);
        vm.movImm(VReg.V5, CLOSURE_MAGIC);
        vm.cmp(VReg.V4, VReg.V5);
        vm.jeq(closureCallLabel);
        vm.movImm(VReg.V5, ASYNC_CLOSURE_MAGIC);
        vm.cmp(VReg.V4, VReg.V5);
        vm.jeq(closureCallLabel);

        // heap 内但不是 closure，按裸函数指针处理
        vm.jmp(directCallLabel);

        vm.label(closureCallLabel);
        // closure: S0=closure_ptr, call closure.func_ptr
        vm.load(VReg.V1, callbackReg, 8);
        vm.mov(VReg.S0, callbackReg);
        vm.mov(VReg.A0, argReg);
        vm.callIndirect(VReg.V1);
        // 清掉 closure 指针，避免影响后续直接调用路径
        vm.movImm(VReg.S0, 0);
        vm.jmp(afterCallLabel);

        vm.label(directCallLabel);
        vm.movImm(VReg.S0, 0);
        vm.mov(VReg.A0, argReg);
        vm.callIndirect(callbackReg);

        vm.label(afterCallLabel);
    }

    generate() {
        this.generatePromiseNew();
        this.generatePromiseResolve();
        this.generatePromiseReject();
        this.generatePromiseThen();
        this.generatePromiseCatch();
        this.generatePromiseAwait();
        this.generatePromiseResolveStatic();
        this.generatePromiseRejectStatic();
    }

    // _promise_new: 创建新 Promise
    // A0 = executor 函数 (可选, 0 表示无)
    // 返回: Promise 对象指针
    generatePromiseNew() {
        const vm = this.vm;

        vm.label("_promise_new");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // executor

        // 分配 Promise 对象
        vm.movImm(VReg.A0, PROMISE_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET);

        // 设置类型
        vm.movImm(VReg.V1, TYPE_PROMISE);
        vm.store(VReg.S1, 0, VReg.V1);

        // 设置状态为 pending
        vm.movImm(VReg.V1, PROMISE_PENDING);
        vm.store(VReg.S1, 8, VReg.V1);

        // 初始化其他字段为 0
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S1, 16, VReg.V1); // value
        vm.store(VReg.S1, 24, VReg.V1); // then_handlers
        vm.store(VReg.S1, 32, VReg.V1); // catch_handlers
        vm.store(VReg.S1, 40, VReg.V1); // waiting_coro

        // 如果有 executor，调用它
        vm.cmpImm(VReg.S0, 0);
        const noExecutorLabel = "_promise_no_executor";
        vm.jeq(noExecutorLabel);

        // 创建 resolve 和 reject 函数
        // 简化：直接传递 Promise 指针
        vm.mov(VReg.A0, VReg.S1); // Promise
        // 调用 executor(resolve_ctx, reject_ctx)
        // 暂时简化处理
        // TODO: 完整实现

        vm.label(noExecutorLabel);
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // _promise_resolve: 解决 Promise
    // A0 = Promise 指针
    // A1 = 值
    generatePromiseResolve() {
        const vm = this.vm;

        vm.label("_promise_resolve");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 注意：S0 会被 emitInvokeCallback1 用作 closure_ptr
        vm.mov(VReg.S3, VReg.A0); // Promise
        vm.mov(VReg.S1, VReg.A1); // value

        // 检查是否已经 settled
        vm.load(VReg.V1, VReg.S3, 8);
        vm.cmpImm(VReg.V1, PROMISE_PENDING);
        const isPendingLabel = "_promise_resolve_pending";
        vm.jeq(isPendingLabel);
        // 已经 settled，直接返回
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label(isPendingLabel);

        // 设置状态和值
        vm.movImm(VReg.V1, PROMISE_FULFILLED);
        vm.store(VReg.S3, 8, VReg.V1);
        vm.store(VReg.S3, 16, VReg.S1);

        // 唤醒等待的协程
        vm.load(VReg.S2, VReg.S3, 40);
        vm.cmpImm(VReg.S2, 0);
        const noWaitingLabel = "_promise_resolve_no_waiting";
        vm.jeq(noWaitingLabel);

        // 将等待的协程加入就绪队列
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_scheduler_spawn");

        vm.label(noWaitingLabel);

        // 调用 then handlers
        vm.load(VReg.S2, VReg.S3, 24); // then_handlers
        const handlerLoopLabel = "_promise_resolve_handler_loop";
        const handlerDoneLabel = "_promise_resolve_handler_done";

        vm.label(handlerLoopLabel);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(handlerDoneLabel);

        // 调用 handler
        vm.load(VReg.V1, VReg.S2, 0); // callback
        vm.cmpImm(VReg.V1, 0);
        const skipCallLabel = "_promise_resolve_skip_call";
        vm.jeq(skipCallLabel);

        // 调用回调（支持闭包对象）
        this.emitInvokeCallback1(VReg.V1, VReg.S1);

        // 如果 then 返回了新的 Promise，解决它
        vm.load(VReg.V2, VReg.S2, 8); // next_promise
        vm.cmpImm(VReg.V2, 0);
        vm.jeq(skipCallLabel);
        vm.mov(VReg.A0, VReg.V2);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_promise_resolve");

        vm.label(skipCallLabel);
        vm.load(VReg.S2, VReg.S2, 16); // next handler
        vm.jmp(handlerLoopLabel);

        vm.label(handlerDoneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _promise_reject: 拒绝 Promise
    // A0 = Promise 指针
    // A1 = 原因
    generatePromiseReject() {
        const vm = this.vm;

        vm.label("_promise_reject");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 注意：S0 会被 emitInvokeCallback1 用作 closure_ptr
        vm.mov(VReg.S3, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 检查是否已经 settled
        vm.load(VReg.V1, VReg.S3, 8);
        vm.cmpImm(VReg.V1, PROMISE_PENDING);
        const isPendingLabel = "_promise_reject_pending";
        vm.jeq(isPendingLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label(isPendingLabel);

        // 设置状态和原因
        vm.movImm(VReg.V1, PROMISE_REJECTED);
        vm.store(VReg.S3, 8, VReg.V1);
        vm.store(VReg.S3, 16, VReg.S1);

        // 调用 catch handlers
        vm.load(VReg.S2, VReg.S3, 32);
        const catchLoopLabel = "_promise_reject_catch_loop";
        const catchDoneLabel = "_promise_reject_catch_done";

        vm.label(catchLoopLabel);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(catchDoneLabel);

        vm.load(VReg.V1, VReg.S2, 0);
        vm.cmpImm(VReg.V1, 0);
        const skipCatchLabel = "_promise_reject_skip_catch";
        vm.jeq(skipCatchLabel);

        // 调用 catch 回调（支持闭包对象）
        this.emitInvokeCallback1(VReg.V1, VReg.S1);

        vm.label(skipCatchLabel);
        vm.load(VReg.S2, VReg.S2, 16);
        vm.jmp(catchLoopLabel);

        vm.label(catchDoneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _promise_then: 注册 then 回调
    // A0 = Promise 指针
    // A1 = onFulfilled 回调
    // 返回: 新的 Promise
    generatePromiseThen() {
        const vm = this.vm;

        vm.label("_promise_then");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // Promise
        vm.mov(VReg.S1, VReg.A1); // callback

        // 创建新的 Promise 用于链式调用
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.S2, VReg.RET); // 新 Promise

        // 分配 handler 节点
        vm.movImm(VReg.A0, HANDLER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        // 设置 handler
        vm.store(VReg.S3, 0, VReg.S1); // callback
        vm.store(VReg.S3, 8, VReg.S2); // next_promise

        // 检查 Promise 状态
        vm.load(VReg.V1, VReg.S0, 8);
        vm.cmpImm(VReg.V1, PROMISE_FULFILLED);
        const alreadyFulfilledLabel = "_promise_then_already_fulfilled";
        vm.jeq(alreadyFulfilledLabel);

        // 还在 pending，添加到 handler 链表
        vm.load(VReg.V1, VReg.S0, 24); // 当前 head
        vm.store(VReg.S3, 16, VReg.V1); // handler.next = old_head
        vm.store(VReg.S0, 24, VReg.S3); // head = handler

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label(alreadyFulfilledLabel);
        // 已经 fulfilled，立即调用回调
        vm.load(VReg.V1, VReg.S0, 16); // value
        this.emitInvokeCallback1(VReg.S1, VReg.V1);

        // 用回调结果 resolve 新 Promise
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_promise_resolve");

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _promise_catch: 注册 catch 回调
    generatePromiseCatch() {
        const vm = this.vm;

        vm.label("_promise_catch");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 创建新 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.S2, VReg.RET);

        // 分配 handler
        vm.movImm(VReg.A0, HANDLER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        vm.store(VReg.S3, 0, VReg.S1);
        vm.store(VReg.S3, 8, VReg.S2);

        // 添加到 catch_handlers
        vm.load(VReg.V1, VReg.S0, 32);
        vm.store(VReg.S3, 16, VReg.V1);
        vm.store(VReg.S0, 32, VReg.S3);

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _promise_await: 等待 Promise 完成
    // A0 = Promise 指针
    // 返回: resolved 值
    // 这是 await 的核心实现
    generatePromiseAwait() {
        const vm = this.vm;

        vm.label("_promise_await");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);

        // 检查是否已经完成
        vm.load(VReg.V1, VReg.S0, 8);
        vm.cmpImm(VReg.V1, PROMISE_FULFILLED);
        const alreadyDoneLabel = "_promise_await_done";
        vm.jeq(alreadyDoneLabel);

        // 还在 pending，挂起当前协程
        // 获取当前协程
        vm.lea(VReg.S1, "_scheduler_current");
        vm.load(VReg.S1, VReg.S1, 0);

        // 将当前协程设置为等待此 Promise
        vm.store(VReg.S0, 40, VReg.S1);

        // yield 让出执行
        vm.call("_coroutine_yield");

        // 被唤醒后，Promise 应该已经 resolved
        vm.load(VReg.RET, VReg.S0, 16);
        vm.epilogue([VReg.S0, VReg.S1], 32);

        vm.label(alreadyDoneLabel);
        // 已完成，直接返回值
        vm.load(VReg.RET, VReg.S0, 16);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // Promise.resolve(value) - 静态方法
    generatePromiseResolveStatic() {
        const vm = this.vm;

        vm.label("_Promise_resolve");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // value

        // 创建新 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");

        // 立即 resolve
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_promise_resolve");

        vm.epilogue([VReg.S0], 16);
    }

    // Promise.reject(reason) - 静态方法
    generatePromiseRejectStatic() {
        const vm = this.vm;

        vm.label("_Promise_reject");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");

        vm.mov(VReg.A1, VReg.S0);
        vm.call("_promise_reject");

        vm.epilogue([VReg.S0], 16);
    }
}
