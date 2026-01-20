// JSBin 打印运行时 - 基础模块
// 提供基础输出函数：字符串、换行、空格、布尔值

import { VReg } from "../../vm/registers.js";

// 基础打印生成器混入
export const BasePrintGenerator = {
    // 辅助：调用 write 系统调用或 Windows API
    // A0=fd/unused, A1=buf, A2=len
    emitWriteCall() {
        const vm = this.vm;
        const platform = vm.platform;
        const arch = vm.arch;

        if (platform === "windows") {
            vm.callWindowsWriteConsole();
        } else if (arch === "arm64") {
            vm.syscall(platform === "linux" ? 64 : 4);
        } else {
            vm.syscall(platform === "linux" ? 1 : 0x2000004);
        }
    },

    // 打印字符串（无换行版本）
    generatePrintStringNoNL() {
        const vm = this.vm;

        vm.label("_print_str_no_nl");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET);

        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.S0);
        vm.mov(VReg.A2, VReg.S1);

        this.emitWriteCall();

        vm.epilogue([VReg.S0, VReg.S1], 16);
    },

    // 打印字符串（带换行）
    generatePrintString() {
        const vm = this.vm;

        vm.label("_print_str");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET);

        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.S0);
        vm.mov(VReg.A2, VReg.S1);
        this.emitWriteCall();

        // 打印换行
        vm.movImm(VReg.V0, 10);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.epilogue([VReg.S0, VReg.S1], 16);
    },

    // 打印换行
    generatePrintNewline() {
        const vm = this.vm;

        vm.label("_print_nl");
        vm.prologue(16, []);

        vm.movImm(VReg.V0, 10);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.epilogue([], 16);
    },

    // 打印布尔值
    generatePrintBool() {
        const vm = this.vm;

        vm.label("_print_bool");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        vm.cmpImm(VReg.S0, 0);
        const falseLabel = "_print_bool_false";
        vm.jeq(falseLabel);

        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str");
        vm.epilogue([VReg.S0], 16);

        vm.label(falseLabel);
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str");
        vm.epilogue([VReg.S0], 16);
    },

    // 打印布尔值（无换行）
    generatePrintBoolNoNL() {
        const vm = this.vm;

        vm.label("_print_bool_no_nl");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        vm.cmpImm(VReg.S0, 0);
        const falseLabel = "_print_bool_no_nl_false";
        vm.jeq(falseLabel);

        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str_no_nl");
        vm.epilogue([VReg.S0], 16);

        vm.label(falseLabel);
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str_no_nl");
        vm.epilogue([VReg.S0], 16);
    },

    // 打印空格
    generatePrintSpace() {
        const vm = this.vm;

        vm.label("_print_space");
        vm.prologue(16, []);

        vm.movImm(VReg.V0, 32);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.epilogue([], 16);
    },

    // 打印单个字符
    generatePrintChar() {
        const vm = this.vm;

        vm.label("_print_char");
        vm.prologue(16, []);

        vm.push(VReg.A0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.epilogue([], 16);
    },

    // print 函数的包装器
    generatePrintWrapper() {
        const vm = this.vm;

        vm.label("_print_wrapper");
        vm.prologue(16, [VReg.S0]);
        vm.call("_print_value");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 16);
    },
};
