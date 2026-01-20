// JSBin 运行时 - Number 打印功能
// 统一的数值打印函数，支持所有 Number 子类型

import { VReg } from "../../../vm/registers.js";
import { StringConstantsGenerator } from "../../core/strings.js";
import { TYPE_INT8, TYPE_INT16, TYPE_INT32, TYPE_INT64, TYPE_UINT8, TYPE_UINT16, TYPE_UINT32, TYPE_UINT64, TYPE_FLOAT32, TYPE_FLOAT64, isIntegerType, isFloatType } from "./types.js";

export class NumberPrintGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
        this.arch = vm.arch;
        this.os = vm.platform;
    }

    // 生成 write 系统调用
    emitWriteCall() {
        if (this.os === "windows") {
            this.vm.callWindowsWriteConsole();
        } else if (this.arch === "arm64") {
            this.vm.syscall(this.os === "linux" ? 64 : 4);
        } else {
            this.vm.syscall(this.os === "linux" ? 1 : 0x2000004);
        }
    }

    // 生成带换行的整数打印函数
    // 输入: A0 = 整数值 (已解包)
    generatePrintInt() {
        const vm = this.vm;

        vm.label("_print_int");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);
        vm.lea(VReg.S1, "_print_buf");
        vm.addImm(VReg.S1, VReg.S1, 20);
        vm.movImm(VReg.V1, 10);
        vm.storeByte(VReg.S1, 0, VReg.V1); // 换行符

        // S2 用于记录是否为负数
        vm.movImm(VReg.S2, 0);

        // 检查是否为负数
        const notNegLabel = this.ctx.newLabel("print_not_neg");
        vm.cmpImm(VReg.S0, 0);
        vm.jge(notNegLabel);
        vm.movImm(VReg.S2, 1);
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S0, VReg.V0, VReg.S0);
        vm.label(notNegLabel);

        const loopLabel = this.ctx.newLabel("print_loop");
        vm.label(loopLabel);
        vm.movImm(VReg.V1, 10);
        vm.div(VReg.V2, VReg.S0, VReg.V1);
        vm.mul(VReg.V3, VReg.V2, VReg.V1);
        vm.sub(VReg.V4, VReg.S0, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.storeByte(VReg.S1, 0, VReg.V4);
        vm.mov(VReg.S0, VReg.V2);
        vm.cmpImm(VReg.S0, 0);
        vm.jne(loopLabel);

        // 如果是负数，添加负号
        const noMinusLabel = this.ctx.newLabel("print_no_minus");
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(noMinusLabel);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.movImm(VReg.V0, 45); // '-'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.label(noMinusLabel);

        vm.movImm(VReg.A0, 1);
        vm.lea(VReg.V2, "_print_buf");
        vm.addImm(VReg.V2, VReg.V2, 21);
        vm.sub(VReg.A2, VReg.V2, VReg.S1);
        vm.mov(VReg.A1, VReg.S1);

        this.emitWriteCall();
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 64);
    }

    // 生成无换行的整数打印函数
    generatePrintIntNoNL() {
        const vm = this.vm;

        vm.label("_print_int_no_nl");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);
        vm.lea(VReg.S1, "_print_buf");
        vm.addImm(VReg.S1, VReg.S1, 20);

        vm.movImm(VReg.S2, 0);

        const notNegLabel = this.ctx.newLabel("print_nonl_not_neg");
        vm.cmpImm(VReg.S0, 0);
        vm.jge(notNegLabel);
        vm.movImm(VReg.S2, 1);
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S0, VReg.V0, VReg.S0);
        vm.label(notNegLabel);

        const loopLabel = this.ctx.newLabel("print_nonl_loop");
        vm.label(loopLabel);
        vm.movImm(VReg.V1, 10);
        vm.div(VReg.V2, VReg.S0, VReg.V1);
        vm.mul(VReg.V3, VReg.V2, VReg.V1);
        vm.sub(VReg.V4, VReg.S0, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.storeByte(VReg.S1, 0, VReg.V4);
        vm.mov(VReg.S0, VReg.V2);
        vm.cmpImm(VReg.S0, 0);
        vm.jne(loopLabel);

        const noMinusLabel = this.ctx.newLabel("print_nonl_no_minus");
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(noMinusLabel);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.movImm(VReg.V0, 45);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.label(noMinusLabel);

        vm.movImm(VReg.A0, 1);
        vm.lea(VReg.V2, "_print_buf");
        vm.addImm(VReg.V2, VReg.V2, 20);
        vm.sub(VReg.A2, VReg.V2, VReg.S1);
        vm.mov(VReg.A1, VReg.S1);

        this.emitWriteCall();
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 64);
    }

    // 生成浮点数打印函数 (float64)
    // 输入: A0 = IEEE 754 位模式 (已解包)
    generatePrintFloat() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_print_float");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // S0 = 原始值（位表示）
        vm.mov(VReg.S0, VReg.A0);

        // 将位表示移动到浮点寄存器
        vm.fmovToFloat(0, VReg.S0);

        // 检查是否为负数
        vm.movImm(VReg.S1, 0);
        vm.fcmpZero(0);
        const notNegLabel = "_print_float_not_neg";
        vm.jge(notNegLabel);

        vm.movImm(VReg.S1, 1);
        vm.fabs(0, 0);

        vm.label(notNegLabel);

        // 检查是否为整数
        vm.ftrunc(1, 0);
        vm.fcmp(0, 1);

        const hasDecimalLabel = "_print_float_has_decimal";
        vm.jne(hasDecimalLabel);

        // 是整数路径
        // 注意: fcvtzs 结果存到 S2（避免 V0/A0 寄存器别名问题）
        vm.fcvtzs(VReg.S2, 0);

        vm.cmpImm(VReg.S1, 0);
        const printIntNoMinusLabel = "_print_float_int_no_minus";
        vm.jeq(printIntNoMinusLabel);

        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(printIntNoMinusLabel);
        vm.mov(VReg.A0, VReg.S2); // 从 S2 加载整数值到 A0
        vm.call("_print_int");
        vm.jmp("_print_float_done");

        // 有小数部分
        vm.label(hasDecimalLabel);

        vm.cmpImm(VReg.S1, 0);
        const noMinusLabel = "_print_float_no_minus";
        vm.jeq(noMinusLabel);
        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(noMinusLabel);

        // 计算小数部分
        vm.fmov(2, 0);
        vm.fsub(2, 2, 1);

        // 四舍五入
        vm.movImm(VReg.V0, 0x3ea0c6f7);
        vm.shl(VReg.V0, VReg.V0, 32);
        vm.movImm(VReg.V1, 0xa0b5ed8d);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.fmovToFloat(5, VReg.V0);
        vm.fadd(2, 2, 5);

        // 保存小数部分
        vm.fmovToInt(VReg.V0, 2);
        vm.push(VReg.V0);

        // 保存并打印整数部分
        vm.fcvtzs(VReg.S3, 1);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_print_int_no_nl");

        // 打印小数点
        vm.movImm(VReg.V1, 46);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        // 恢复小数部分
        vm.pop(VReg.V0);
        vm.fmovToFloat(2, VReg.V0);

        // 分配缓冲区
        vm.subImm(VReg.SP, VReg.SP, 48);
        vm.mov(VReg.S0, VReg.SP);

        vm.movImm(VReg.S4, 0);
        vm.movImm(VReg.S5, 0);
        vm.movImm(VReg.S2, 6);
        vm.movImm(VReg.S3, 10);

        vm.scvtf(3, VReg.S3);

        const decimalLoopLabel = "_print_float_decimal_loop";
        const decimalBufferDoneLabel = "_print_float_buffer_done";

        vm.label(decimalLoopLabel);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(decimalBufferDoneLabel);
        vm.subImm(VReg.S2, VReg.S2, 1);

        vm.fmul(2, 2, 3);
        vm.ftrunc(4, 2);
        vm.fcvtzs(VReg.V0, 4);

        vm.addImm(VReg.V0, VReg.V0, 48);
        vm.shl(VReg.V1, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V0);

        vm.cmpImm(VReg.V0, 48);
        const skipUpdateLabel = "_print_float_skip_update";
        vm.jeq(skipUpdateLabel);
        vm.addImm(VReg.S5, VReg.S4, 1);
        vm.label(skipUpdateLabel);

        vm.addImm(VReg.S4, VReg.S4, 1);

        vm.fsub(2, 2, 4);

        vm.jmp(decimalLoopLabel);

        vm.label(decimalBufferDoneLabel);

        vm.movImm(VReg.S2, 0);
        const printDigitLoopLabel = "_print_float_digit_loop";
        const decimalDoneLabel = "_print_float_decimal_done";

        vm.label(printDigitLoopLabel);
        vm.cmp(VReg.S2, VReg.S5);
        vm.jge(decimalDoneLabel);

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.load(VReg.V0, VReg.V1, 0);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(printDigitLoopLabel);

        vm.label(decimalDoneLabel);
        vm.addImm(VReg.SP, VReg.SP, 48);
        vm.call("_print_nl");

        vm.label("_print_float_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);
    }

    // 生成无换行浮点打印
    generatePrintFloatNoNL() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_print_float_no_nl");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0);

        vm.fmovToFloat(0, VReg.S0);

        vm.movImm(VReg.S1, 0);
        vm.fcmpZero(0);
        const notNegLabel = "_print_float_nonl_not_neg";
        vm.jge(notNegLabel);

        vm.movImm(VReg.S1, 1);
        vm.fabs(0, 0);

        vm.label(notNegLabel);

        vm.ftrunc(1, 0);
        vm.fcmp(0, 1);

        const hasDecimalLabel = "_print_float_nonl_has_decimal";
        vm.jne(hasDecimalLabel);

        vm.fcvtzs(VReg.V0, 0);

        vm.cmpImm(VReg.S1, 0);
        const printIntNoMinusLabel = "_print_float_nonl_int_no_minus";
        vm.jeq(printIntNoMinusLabel);

        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(printIntNoMinusLabel);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_float_nonl_done");

        vm.label(hasDecimalLabel);

        vm.cmpImm(VReg.S1, 0);
        const noMinusLabel = "_print_float_nonl_no_minus";
        vm.jeq(noMinusLabel);
        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(noMinusLabel);

        vm.fmov(2, 0);
        vm.fsub(2, 2, 1);

        // 打印整数部分
        vm.fcvtzs(VReg.V0, 1);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_print_int_no_nl");

        // 打印小数点
        vm.movImm(VReg.V1, 46);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        // 打印小数部分（去掉尾部的零）
        vm.movImm(VReg.S3, 10);
        vm.scvtf(3, VReg.S3);

        // 分配缓冲区来存储数字
        vm.subImm(VReg.SP, VReg.SP, 48);
        vm.mov(VReg.S0, VReg.SP);

        vm.movImm(VReg.S4, 0); // 当前索引
        vm.movImm(VReg.S5, 0); // 最后一个非零数字的位置 + 1
        const decimalLoopLabel = "_print_float_nonl_decimal_loop";
        const decimalBufferDoneLabel = "_print_float_nonl_buffer_done";

        vm.label(decimalLoopLabel);
        vm.cmpImm(VReg.S4, 6);
        vm.jge(decimalBufferDoneLabel);

        vm.fmul(2, 2, 3);
        vm.ftrunc(4, 2);
        vm.fcvtzs(VReg.V0, 4);
        vm.fsub(2, 2, 4);

        // 将数字存入缓冲区
        vm.addImm(VReg.V0, VReg.V0, 48);
        vm.shl(VReg.V1, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V0);

        // 如果不是 '0'，更新最后非零位置
        vm.cmpImm(VReg.V0, 48); // '0'
        const skipUpdateLabel = "_print_float_nonl_skip_update";
        vm.jeq(skipUpdateLabel);
        vm.addImm(VReg.S5, VReg.S4, 1);
        vm.label(skipUpdateLabel);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(decimalLoopLabel);

        vm.label(decimalBufferDoneLabel);

        // 打印缓冲区中的数字，直到最后一个非零位置
        vm.movImm(VReg.S4, 0);
        const printDigitLoopLabel = "_print_float_nonl_digit_loop";
        const decimalDoneLabel = "_print_float_nonl_decimal_done";

        vm.label(printDigitLoopLabel);
        vm.cmp(VReg.S4, VReg.S5);
        vm.jge(decimalDoneLabel);

        vm.shl(VReg.V0, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.load(VReg.V0, VReg.V1, 0);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(printDigitLoopLabel);

        vm.label(decimalDoneLabel);
        vm.addImm(VReg.SP, VReg.SP, 48);

        vm.label("_print_float_nonl_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);
    }

    // 生成 Float32 打印（输入: A0 = 32位浮点位模式，需要转换为 float64 再打印）
    generatePrintFloat32NoNL() {
        const vm = this.vm;

        vm.label("_print_float32_no_nl");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 将 32 位整数移到单精度浮点寄存器
        vm.fmovToFloatSingle(0, VReg.S0);
        // 转换为双精度: single to double
        vm.fcvts2d(0, 0);
        // 从双精度浮点寄存器移回通用寄存器
        vm.fmovToInt(VReg.A0, 0);

        vm.call("_print_float_no_nl");

        vm.epilogue([VReg.S0], 16);
    }

    // 生成 Number 对象打印函数
    // 输入: A0 = Number 对象指针
    // 根据类型标记自动选择正确的打印方式
    generatePrintNumber() {
        const vm = this.vm;

        vm.label("_print_number");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // 加载类型标记到 S1（避免被 A0 覆盖）
        vm.load(VReg.S1, VReg.S0, 0);

        // 加载数值到 A0
        vm.load(VReg.A0, VReg.S0, 8);

        // 类型判断逻辑:
        // - TYPE_NUMBER = 13 → 浮点路径（内部存储为 float64）
        // - TYPE_INT8-INT64, UINT8-UINT64 (20-27) → 整数路径
        // - TYPE_FLOAT32-FLOAT64 (28-29) → 浮点路径

        const isFloatLabel = "_print_number_float";
        const isIntLabel = "_print_number_int";
        const doneLabel = "_print_number_done";

        // 检查是否为 TYPE_NUMBER = 13（通用数字类型，存储 float64）
        vm.cmpImm(VReg.S1, 13);
        vm.jeq(isFloatLabel);

        // 检查是否为整数类型 (20-27)
        vm.cmpImm(VReg.S1, TYPE_INT8); // 20
        vm.jlt(isFloatLabel); // < 20 未知，当作浮点
        vm.cmpImm(VReg.S1, TYPE_FLOAT32); // 28
        vm.jlt(isIntLabel); // 20-27 是整数

        // >= 28 是浮点类型
        vm.label(isFloatLabel);
        vm.call("_print_float");
        vm.jmp(doneLabel);

        vm.label(isIntLabel);
        // 整数类型：直接打印
        vm.call("_print_int");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 生成无换行版本
    generatePrintNumberNoNL() {
        const vm = this.vm;

        vm.label("_print_number_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // 加载类型到 S1（避免被 A0 覆盖）
        vm.load(VReg.S1, VReg.S0, 0);
        vm.load(VReg.A0, VReg.S0, 8);

        // 类型判断逻辑（同 generatePrintNumber）
        const isFloatLabel = "_print_number_nonl_float";
        const isIntLabel = "_print_number_nonl_int";
        const doneLabel = "_print_number_nonl_done";

        // 检查是否为 TYPE_NUMBER = 13（通用数字类型，存储 float64）
        vm.cmpImm(VReg.S1, 13);
        vm.jeq(isFloatLabel);

        // 检查是否为整数类型 (20-27)
        vm.cmpImm(VReg.S1, TYPE_INT8); // 20
        vm.jlt(isFloatLabel); // < 20 未知，当作浮点
        vm.cmpImm(VReg.S1, TYPE_FLOAT32); // 28
        vm.jlt(isIntLabel); // 20-27 是整数

        // >= 28 是浮点类型
        vm.label(isFloatLabel);
        vm.call("_print_float_no_nl");
        vm.jmp(doneLabel);

        vm.label(isIntLabel);
        vm.call("_print_int_no_nl");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 生成所有打印函数
    generate() {
        this.generatePrintInt();
        this.generatePrintIntNoNL();
        this.generatePrintFloat();
        this.generatePrintFloatNoNL();
        this.generatePrintFloat32NoNL();
        this.generatePrintNumber();
        this.generatePrintNumberNoNL();
    }

    // 生成数据段
    generateDataSection(asm) {
        const strGen = new StringConstantsGenerator(asm);
        strGen.generatePrintBuffer();
        strGen.generateAll();
    }
}
