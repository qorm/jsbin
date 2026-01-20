// JSBin 运行时 - 协程支持
// 实现类似 goroutine 的协程系统
// 使用栈切换和上下文保存

import { VReg } from "../../vm/index.js";

// 协程状态
const CORO_STATUS_CREATED = 0; // 刚创建
const CORO_STATUS_RUNNING = 1; // 运行中
const CORO_STATUS_SUSPENDED = 2; // 挂起
const CORO_STATUS_COMPLETED = 3; // 已完成

// 协程对象内存布局 (ARM64/x64):
// +0:   type (8 bytes) = TYPE_COROUTINE (10)
// +8:   status (8 bytes)
// +16:  stack_base (8 bytes) - 协程栈基址
// +24:  stack_size (8 bytes) - 栈大小
// +32:  saved_sp (8 bytes) - 保存的栈指针
// +40:  saved_fp (8 bytes) - 保存的帧指针
// +48:  saved_lr (8 bytes) - 保存的返回地址 (ARM64) / RIP (x64)
// +56:  func_ptr (8 bytes) - 协程函数指针
// +64:  arg (8 bytes) - 函数参数
// +72:  result (8 bytes) - 返回值
// +80:  next (8 bytes) - 链表下一个
// +88:  promise (8 bytes) - 关联的 Promise

const TYPE_COROUTINE = 10;
const COROUTINE_SIZE = 104;
const COROUTINE_STACK_SIZE = 65536; // 64KB 栈

// 闭包魔数（与编译器保持一致）
// async 闭包在协程入口需要把 closure_ptr 放到 S0

export class CoroutineGenerator {
    constructor(vm) {
        this.vm = vm;
        this.arch = vm.arch;
        this.os = vm.os;
    }

    // 生成 write 系统调用
    emitWriteCall() {
        const vm = this.vm;
        if (this.os === "windows") {
            vm.callWindowsWriteConsole();
        } else if (this.arch === "arm64") {
            vm.syscall(this.os === "linux" ? 64 : 4);
        } else {
            vm.syscall(this.os === "linux" ? 1 : 0x2000004);
        }
    }

    generate() {
        this.generateCoroutineCreate();
        this.generateCoroutineResume();
        this.generateCoroutineYield();
        this.generateCoroutineReturn();
        this.generateSchedulerData();
        this.generateSchedulerInit();
        this.generateSchedulerRun();
        this.generateSchedulerSpawn();
    }

    // _coroutine_create: 创建新协程
    // A0 = 函数指针
    // A1 = 参数
    // A2 = closure 指针（可选，0 表示无）
    // 返回: 协程对象指针
    generateCoroutineCreate() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_coroutine_create");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // 函数指针
        vm.mov(VReg.S1, VReg.A1); // 参数
        vm.mov(VReg.V4, VReg.A2); // closure_ptr

        // 分配协程对象
        vm.movImm(VReg.A0, COROUTINE_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = 协程对象

        // 设置类型
        vm.movImm(VReg.V1, TYPE_COROUTINE);
        vm.store(VReg.S2, 0, VReg.V1);

        // 设置状态为 CREATED
        vm.movImm(VReg.V1, CORO_STATUS_CREATED);
        vm.store(VReg.S2, 8, VReg.V1);

        // 分配协程栈
        vm.movImm(VReg.A0, COROUTINE_STACK_SIZE);
        vm.call("_alloc");

        // 设置栈基址
        vm.store(VReg.S2, 16, VReg.RET);

        // 设置栈大小
        vm.movImm(VReg.V1, COROUTINE_STACK_SIZE);
        vm.store(VReg.S2, 24, VReg.V1);

        // 初始化栈指针 (栈顶 = 栈基址 + 栈大小，然后对齐到 16 字节)
        // ARM64 要求 SP 必须是 16 字节对齐的
        vm.addImm(VReg.V1, VReg.RET, COROUTINE_STACK_SIZE);
        // 对齐到 16 字节: sp = sp & ~0xF
        vm.movImm(VReg.V2, -16); // 0xFFFFFFFFFFFFFFF0
        vm.and(VReg.V1, VReg.V1, VReg.V2);
        vm.store(VReg.S2, 32, VReg.V1); // saved_sp

        // 初始化帧指针 = 栈指针
        vm.store(VReg.S2, 40, VReg.V1); // saved_fp

        // 设置入口地址为协程 trampoline
        vm.lea(VReg.V1, "_coroutine_entry");
        vm.store(VReg.S2, 48, VReg.V1); // saved_lr

        // 保存函数指针
        vm.store(VReg.S2, 56, VReg.S0);

        // 保存参数
        vm.store(VReg.S2, 64, VReg.S1);

        // 初始化 result = 0
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S2, 72, VReg.V1);

        // next = null
        vm.store(VReg.S2, 80, VReg.V1);

        // promise = null
        vm.store(VReg.S2, 88, VReg.V1);

        // closure_ptr
        vm.store(VReg.S2, 96, VReg.V4);

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // 协程入口 trampoline
        // 当协程首次被 resume 时执行
        vm.label("_coroutine_entry");
        // 加载当前协程指针
        vm.lea(VReg.V0, "_scheduler_current");
        vm.load(VReg.V0, VReg.V0, 0);

        // 注意：在 arm64 上 V0 与 A0 都映射到 X0。
        // 下面会把参数加载到 A0(X0)，因此先把协程指针复制到 callee-saved 寄存器作为 base。
        vm.mov(VReg.S1, VReg.V0);

        // 加载函数指针和参数
        vm.load(VReg.V1, VReg.S1, 56); // func_ptr
        vm.load(VReg.A0, VReg.S1, 64); // arg

        // 恢复 closure 指针到 S0（闭包函数会从 S0 读取捕获变量）
        vm.load(VReg.S0, VReg.S1, 96); // closure_ptr

        // 调用协程函数
        vm.callIndirect(VReg.V1);

        // 函数返回，保存结果并标记完成
        vm.lea(VReg.V1, "_scheduler_current");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.store(VReg.V1, 72, VReg.RET); // 保存返回值

        // 调用 _coroutine_return 处理完成
        vm.jmp("_coroutine_return");
    }

    // _coroutine_resume: 恢复协程执行
    // A0 = 协程对象指针
    // A1 = resume value（可选，0 表示无）
    generateCoroutineResume() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_coroutine_resume");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 目标协程

        // 检查状态
        vm.load(VReg.V1, VReg.S0, 8);
        vm.cmpImm(VReg.V1, CORO_STATUS_COMPLETED);
        const notCompletedLabel = "_coro_resume_not_completed";
        vm.jne(notCompletedLabel);

        // 已完成，返回结果
        vm.load(VReg.RET, VReg.S0, 72);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label(notCompletedLabel);

        // 写入 resume value（yield 恢复后会读这里作为返回值）
        vm.store(VReg.S0, 72, VReg.A1);

        // 获取主协程指针
        vm.lea(VReg.S1, "_scheduler_main");
        vm.load(VReg.S1, VReg.S1, 0);

        // 保存当前上下文到主协程
        // 注意: ARM64 的 STR 指令中 Rt=31 是 XZR 不是 SP
        // 需要先把 SP 复制到通用寄存器再 store
        vm.mov(VReg.V0, VReg.SP);
        vm.store(VReg.S1, 32, VReg.V0); // saved_sp
        vm.store(VReg.S1, 40, VReg.FP); // saved_fp

        // 设置当前协程
        vm.lea(VReg.V1, "_scheduler_current");
        vm.store(VReg.V1, 0, VReg.S0);

        // 设置状态为运行中
        vm.movImm(VReg.V1, CORO_STATUS_RUNNING);
        vm.store(VReg.S0, 8, VReg.V1);

        // 加载目标协程的上下文
        vm.load(VReg.V1, VReg.S0, 32); // saved_sp
        vm.load(VReg.V2, VReg.S0, 40); // saved_fp
        vm.load(VReg.V3, VReg.S0, 48); // saved_lr

        // 切换到目标协程
        vm.mov(VReg.SP, VReg.V1);
        vm.mov(VReg.FP, VReg.V2);

        // 跳转到目标协程
        vm.jmpIndirect(VReg.V3);

        // 从 yield/return 回来的 continuation
        // 这里运行在主协程（调度器）栈上，直接把控制权还给调用者（scheduler_run）
        vm.label("_coroutine_resume_cont");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // _coroutine_yield: 挂起当前协程
    // 恢复后：返回 resume value（由 _coroutine_resume 写入 coro.result/+72）
    generateCoroutineYield() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_coroutine_yield");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        // 获取当前协程
        vm.lea(VReg.S0, "_scheduler_current");
        vm.load(VReg.S0, VReg.S0, 0);

        // 设置状态为挂起
        vm.movImm(VReg.V1, CORO_STATUS_SUSPENDED);
        vm.store(VReg.S0, 8, VReg.V1);

        // 保存当前上下文
        // ARM64: STR Rt=31 是 XZR，需要先 mov SP 到通用寄存器
        vm.mov(VReg.V0, VReg.SP);
        vm.store(VReg.S0, 32, VReg.V0);
        vm.store(VReg.S0, 40, VReg.FP);
        // 保存恢复地址：恢复时回到 _coroutine_yield_resume
        vm.lea(VReg.V1, "_coroutine_yield_resume");
        vm.store(VReg.S0, 48, VReg.V1);

        // 获取主协程
        vm.lea(VReg.S1, "_scheduler_main");
        vm.load(VReg.S1, VReg.S1, 0);

        // 设置当前为主协程
        vm.lea(VReg.V1, "_scheduler_current");
        vm.store(VReg.V1, 0, VReg.S1);

        // 恢复主协程上下文
        vm.load(VReg.V1, VReg.S1, 32); // saved_sp
        vm.load(VReg.V2, VReg.S1, 40); // saved_fp

        vm.mov(VReg.SP, VReg.V1);
        vm.mov(VReg.FP, VReg.V2);

        // 回到 _coroutine_resume 的 continuation
        vm.mov(VReg.RET, VReg.S0); // 返回刚刚 yield 的协程指针
        vm.jmp("_coroutine_resume_cont");

        // ===== resume continuation（在协程栈上执行） =====
        vm.label("_coroutine_yield_resume");
        // 从当前协程读回 resume value 作为 yield 的返回值
        vm.lea(VReg.S0, "_scheduler_current");
        vm.load(VReg.S0, VReg.S0, 0);
        vm.load(VReg.RET, VReg.S0, 72);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // _coroutine_return: 协程完成时调用
    generateCoroutineReturn() {
        const vm = this.vm;

        vm.label("_coroutine_return");

        // 获取当前协程
        vm.lea(VReg.V0, "_scheduler_current");
        vm.load(VReg.V0, VReg.V0, 0);

        // 设置状态为完成
        vm.movImm(VReg.V1, CORO_STATUS_COMPLETED);
        vm.store(VReg.V0, 8, VReg.V1);

        // 获取主协程
        vm.lea(VReg.V1, "_scheduler_main");
        vm.load(VReg.V1, VReg.V1, 0);

        // 设置当前为主协程
        vm.lea(VReg.V2, "_scheduler_current");
        vm.store(VReg.V2, 0, VReg.V1);

        // 恢复主协程上下文
        vm.load(VReg.V2, VReg.V1, 32);
        vm.load(VReg.V3, VReg.V1, 40);

        vm.mov(VReg.SP, VReg.V2);
        vm.mov(VReg.FP, VReg.V3);

        // 返回到 _coroutine_resume 的 continuation
        vm.mov(VReg.RET, VReg.V0);
        vm.jmp("_coroutine_resume_cont");
    }

    // 调度器数据段
    generateSchedulerData() {
        // 这些在 data section 中生成
        // 由 generateDataSection 处理
    }

    // _scheduler_init: 初始化调度器
    generateSchedulerInit() {
        const vm = this.vm;

        vm.label("_scheduler_init");
        vm.prologue(16, [VReg.S0]);

        // 创建主协程对象
        vm.movImm(VReg.A0, COROUTINE_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        // 设置类型
        vm.movImm(VReg.V1, TYPE_COROUTINE);
        vm.store(VReg.S0, 0, VReg.V1);

        // 设置状态为运行中
        vm.movImm(VReg.V1, CORO_STATUS_RUNNING);
        vm.store(VReg.S0, 8, VReg.V1);

        // 主协程使用当前栈
        // ARM64: STR Rt=31 是 XZR，需要先 mov SP 到通用寄存器
        vm.mov(VReg.V0, VReg.SP);
        vm.store(VReg.S0, 32, VReg.V0);
        vm.store(VReg.S0, 40, VReg.FP);

        // 设置为主协程和当前协程
        vm.lea(VReg.V1, "_scheduler_main");
        vm.store(VReg.V1, 0, VReg.S0);

        vm.lea(VReg.V1, "_scheduler_current");
        vm.store(VReg.V1, 0, VReg.S0);

        // 初始化就绪队列为空
        vm.movImm(VReg.V1, 0);
        vm.lea(VReg.V2, "_scheduler_ready_head");
        vm.store(VReg.V2, 0, VReg.V1);
        vm.lea(VReg.V2, "_scheduler_ready_tail");
        vm.store(VReg.V2, 0, VReg.V1);

        vm.epilogue([VReg.S0], 16);
    }

    // _scheduler_run: 运行调度器
    // 执行所有就绪的协程直到全部完成
    generateSchedulerRun() {
        const vm = this.vm;

        vm.label("_scheduler_run");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        const loopLabel = "_sched_run_loop";
        const doneLabel = "_sched_run_done";

        vm.label(loopLabel);

        // 检查就绪队列是否为空
        vm.lea(VReg.V0, "_scheduler_ready_head");
        vm.load(VReg.S0, VReg.V0, 0);
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(doneLabel);

        // 从队列取出协程
        vm.load(VReg.S1, VReg.S0, 80); // next
        vm.lea(VReg.V0, "_scheduler_ready_head");
        vm.store(VReg.V0, 0, VReg.S1);

        // 如果队列空了，更新 tail
        vm.cmpImm(VReg.S1, 0);
        const notEmptyLabel = "_sched_not_empty";
        vm.jne(notEmptyLabel);
        vm.lea(VReg.V0, "_scheduler_ready_tail");
        vm.store(VReg.V0, 0, VReg.S1);
        vm.label(notEmptyLabel);

        // 清除 next
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S0, 80, VReg.V1);

        // 恢复执行该协程
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 0);
        vm.call("_coroutine_resume");

        // 继续循环
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // _scheduler_spawn: 添加协程到就绪队列
    // A0 = 协程对象指针
    generateSchedulerSpawn() {
        const vm = this.vm;

        vm.label("_scheduler_spawn");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 清除 next
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S0, 80, VReg.V1);

        // 检查队列是否为空
        vm.lea(VReg.V0, "_scheduler_ready_tail");
        vm.load(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 0);
        const notEmptyLabel = "_spawn_not_empty";
        vm.jne(notEmptyLabel);

        // 队列为空，设置 head 和 tail
        vm.lea(VReg.V0, "_scheduler_ready_head");
        vm.store(VReg.V0, 0, VReg.S0);
        vm.lea(VReg.V0, "_scheduler_ready_tail");
        vm.store(VReg.V0, 0, VReg.S0);
        vm.jmp("_spawn_done");

        vm.label(notEmptyLabel);
        // 添加到队列尾部
        vm.store(VReg.V1, 80, VReg.S0); // tail.next = coro
        vm.lea(VReg.V0, "_scheduler_ready_tail");
        vm.store(VReg.V0, 0, VReg.S0); // tail = coro

        vm.label("_spawn_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 16);
    }

    // 生成数据段
    generateDataSection(asm) {
        // 调度器全局变量
        asm.addDataLabel("_scheduler_main");
        asm.addDataQword(0); // 主协程指针

        asm.addDataLabel("_scheduler_current");
        asm.addDataQword(0); // 当前运行的协程

        asm.addDataLabel("_scheduler_ready_head");
        asm.addDataQword(0); // 就绪队列头

        asm.addDataLabel("_scheduler_ready_tail");
        asm.addDataQword(0); // 就绪队列尾
    }
}
