// JSBin 运行时 - process 全局对象
// 提供 Node.js 兼容的 process 对象

import { VReg } from "../../vm/index.js";

export class ProcessGenerator {
    constructor(vm, ctx, os, arch = "arm64") {
        this.vm = vm;
        this.ctx = ctx;
        this.os = os;
        this.arch = arch;
    }

    generate() {
        this.generateProcessInit();
        this.generateArgvInit();
        this.generatePrintCstr(); // 辅助调试函数
    }

    // _print_cstr: 打印 C 字符串（以 null 结尾）
    // A0 = C 字符串指针
    generatePrintCstr() {
        const vm = this.vm;

        vm.label("_print_cstr");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 字符串指针

        // 计算长度
        vm.movImm(VReg.S1, 0); // S1 = 长度
        vm.label("_print_cstr_len_loop");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.add(VReg.V0, VReg.S0, VReg.S1);
        vm.loadByte(VReg.V0, VReg.V0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_cstr_len_done");
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp("_print_cstr_len_loop");

        vm.label("_print_cstr_len_done");
        // 调用 write 系统调用
        vm.movImm(VReg.A0, 1); // fd = 1 (stdout)
        vm.mov(VReg.A1, VReg.S0); // buf = 字符串指针
        vm.mov(VReg.A2, VReg.S1); // count = 长度

        // 系统调用号：
        // macOS ARM64/x64: 4
        // Linux ARM64: 64
        // Linux x64: 1
        if (this.os === "macos") {
            vm.syscall(4);
        } else if (this.os === "linux") {
            vm.syscall(this.arch === "arm64" ? 64 : 1);
        }

        // 打印换行符
        vm.movImm(VReg.V0, 10); // '\n'
        vm.store(VReg.SP, -16, VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.subImm(VReg.A1, VReg.SP, 16);
        vm.movImm(VReg.A2, 1);
        if (this.os === "macos") {
            vm.syscall(4);
        } else if (this.os === "linux") {
            vm.syscall(this.arch === "arm64" ? 64 : 1);
        }

        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // _process_init: 初始化 process 对象
    // 在程序启动时调用，传入 argc 和 argv
    // A0 = argc, A1 = argv (指向 char* 数组的指针)
    generateProcessInit() {
        const vm = this.vm;

        vm.label("_process_init");
        // 分配 32 字节栈空间:
        // [SP+0] = argc, [SP+8] = argv, [SP+16] = process 对象
        vm.prologue(32, []);

        // 保存 argc 和 argv 到栈上
        vm.store(VReg.SP, 0, VReg.A0); // [SP+0] = argc
        vm.store(VReg.SP, 8, VReg.A1); // [SP+8] = argv

        // 创建 process 对象
        vm.movImm(VReg.A0, 64); // 分配空间给 process 对象
        vm.call("_alloc");
        vm.store(VReg.SP, 16, VReg.RET); // [SP+16] = process 对象

        // 设置对象类型标记
        vm.load(VReg.V0, VReg.SP, 16); // V0 = process
        vm.movImm(VReg.V1, 2); // TYPE_OBJECT = 2
        vm.store(VReg.V0, 0, VReg.V1);

        // 保存 process 对象到全局变量
        vm.lea(VReg.V1, "_process_global");
        vm.load(VReg.V0, VReg.SP, 16);
        vm.store(VReg.V1, 0, VReg.V0);

        // 创建 argv 数组
        vm.load(VReg.A0, VReg.SP, 0); // argc
        vm.load(VReg.A1, VReg.SP, 8); // argv
        vm.call("_process_create_argv");
        // RET = argv 数组

        // 保存 argv 数组到栈上临时位置
        vm.store(VReg.SP, 24, VReg.RET);

        // 将 argv 存储到 process.argv (偏移 8)
        vm.load(VReg.V0, VReg.SP, 16); // V0 = process
        vm.load(VReg.V1, VReg.SP, 24); // V1 = argv 数组
        vm.store(VReg.V0, 8, VReg.V1);

        // 返回 process 对象
        vm.load(VReg.RET, VReg.SP, 16);
        vm.epilogue([], 32);
    }

    // _process_create_argv: 创建 argv 数组
    // A0 = argc, A1 = argv (char**)
    // 返回 JS Array 对象
    generateArgvInit() {
        const vm = this.vm;

        vm.label("_process_create_argv");
        // 栈布局:
        // [SP+0]  = argc
        // [SP+8]  = argv (char**)
        // [SP+16] = JS 数组
        // [SP+24] = 当前索引 i
        // [SP+32] = 临时保存字符串
        vm.prologue(48, []);

        // 保存参数
        vm.store(VReg.SP, 0, VReg.A0); // [SP+0] = argc
        vm.store(VReg.SP, 8, VReg.A1); // [SP+8] = argv

        // 创建空数组
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.store(VReg.SP, 16, VReg.RET); // [SP+16] = 数组

        // 初始化索引 i = 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.SP, 24, VReg.V0); // [SP+24] = i = 0

        // 循环: for (i = 0; i < argc; i++)
        vm.label("_argv_loop");
        vm.load(VReg.V0, VReg.SP, 24); // V0 = i
        vm.load(VReg.V1, VReg.SP, 0); // V1 = argc
        vm.cmp(VReg.V0, VReg.V1);
        vm.jge("_argv_done");

        // 获取 argv[i]: char* ptr = argv[i]
        vm.load(VReg.V0, VReg.SP, 24); // V0 = i
        vm.shl(VReg.V0, VReg.V0, 3); // V0 = i * 8 (指针大小)
        vm.load(VReg.V1, VReg.SP, 8); // V1 = argv
        vm.add(VReg.V1, VReg.V1, VReg.V0); // V1 = &argv[i]
        vm.load(VReg.V0, VReg.V1, 0); // V0 = argv[i] (C 字符串指针)

        // 将 C 字符串指针转换为 JSBin 字符串 JSValue（添加 0x7FFC 标签）
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_js_box_string");
        // 保存字符串到 [SP+32] 临时位置（避免被覆盖）
        vm.store(VReg.SP, 32, VReg.RET);

        // 先加载数组到 V0，再设置参数
        vm.load(VReg.V0, VReg.SP, 16); // V0 = 数组
        vm.load(VReg.V1, VReg.SP, 32); // V1 = boxed 字符串（从栈上加载）
        vm.mov(VReg.A1, VReg.V1); // A1 = boxed 字符串 JSValue
        vm.mov(VReg.A0, VReg.V0); // A0 = 数组
        vm.call("_array_push");
        vm.store(VReg.SP, 16, VReg.RET); // 保存可能扩容后的数组

        // i++
        vm.load(VReg.V0, VReg.SP, 24);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.SP, 24, VReg.V0);

        vm.jmp("_argv_loop");

        vm.label("_argv_done");
        // 返回数组
        vm.load(VReg.RET, VReg.SP, 16);
        vm.epilogue([], 48);
    }

    // 生成数据段
    generateDataSection(asm) {
        // process 全局变量存储
        asm.addDataLabel("_process_global");
        asm.addDataQword(0);

        // 异常值存储
        asm.addDataLabel("_exception_value");
        asm.addDataQword(0);

        // 异常待处理标志 (用于跨函数异常传播)
        // 0 = 无异常, 1 = 有待处理异常
        asm.addDataLabel("_exception_pending");
        asm.addDataQword(0);
    }
}
