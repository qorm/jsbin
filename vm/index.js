// JSBin 虚拟机 - 核心抽象层
// 提供统一的指令接口，由后端翻译为目标平台代码

import { VReg } from "./registers.js";
import { OpCode, Instruction } from "./instructions.js";
import { ARM64Backend } from "../backend/arm64.js";
import { X64Backend } from "../backend/x64.js";

export class VirtualMachine {
    constructor(arch, os, asm) {
        this._arch = arch;
        this._os = os;
        this.asm = asm;
        this.backend = this._createBackend(arch, os, asm);
        this.instructions = []; // 用于调试/优化
    }

    _createBackend(arch, os, asm) {
        if (arch === "arm64") {
            return new ARM64Backend(asm, os);
        } else {
            return new X64Backend(asm, os);
        }
    }

    // ========== 平台信息 ==========

    // 获取架构名称 (arm64, x64)
    get arch() {
        return this._arch;
    }

    // 获取平台名称 (linux, macos, windows)
    get platform() {
        return this._os;
    }

    // 获取操作系统 (platform 的别名)
    get os() {
        return this._os;
    }

    // ========== 数据移动 ==========

    // 寄存器到寄存器
    mov(dest, src) {
        this._emit(OpCode.MOV, [dest, src]);
        this.backend.mov(dest, src);
    }

    // 立即数到寄存器
    movImm(dest, imm) {
        this._emit(OpCode.MOV_IMM, [dest, imm]);
        this.backend.movImm(dest, imm);
    }

    // 64位立即数到寄存器 (用于 BigInt 或大数)
    movImm64(dest, imm) {
        this._emit(OpCode.MOV_IMM, [dest, imm]);
        this.backend.movImm64(dest, imm);
    }

    // 从内存加载: dest = [base + offset]
    load(dest, base, offset) {
        this._emit(OpCode.LOAD, [dest, base, offset]);
        this.backend.load(dest, base, offset);
    }

    // 加载字节: dest = [base + offset] (零扩展)
    loadByte(dest, base, offset) {
        this._emit(OpCode.LOAD_BYTE, [dest, base, offset]);
        this.backend.loadByte(dest, base, offset);
    }

    // 存储到内存: [base + offset] = src
    store(base, offset, src) {
        this._emit(OpCode.STORE, [base, offset, src]);
        this.backend.store(base, offset, src);
    }

    // 存储字节到内存: [base + offset] = src (低8位)
    storeByte(base, offset, src) {
        this._emit(OpCode.STORE_BYTE, [base, offset, src]);
        this.backend.storeByte(base, offset, src);
    }

    // 加载标签地址
    lea(dest, label) {
        this._emit(OpCode.LEA, [dest, label]);
        this.backend.lea(dest, label);
    }

    // ========== 算术运算 ==========

    add(dest, a, b) {
        this._emit(OpCode.ADD, [dest, a, b]);
        this.backend.add(dest, a, b);
    }

    addImm(dest, src, imm) {
        this._emit(OpCode.ADD_IMM, [dest, src, imm]);
        this.backend.addImm(dest, src, imm);
    }

    sub(dest, a, b) {
        this._emit(OpCode.SUB, [dest, a, b]);
        this.backend.sub(dest, a, b);
    }

    subImm(dest, src, imm) {
        this._emit(OpCode.SUB_IMM, [dest, src, imm]);
        this.backend.subImm(dest, src, imm);
    }

    mul(dest, a, b) {
        this._emit(OpCode.MUL, [dest, a, b]);
        this.backend.mul(dest, a, b);
    }

    div(dest, a, b) {
        this._emit(OpCode.DIV, [dest, a, b]);
        this.backend.div(dest, a, b);
    }

    mod(dest, a, b) {
        this._emit(OpCode.MOD, [dest, a, b]);
        this.backend.mod(dest, a, b);
    }

    // ========== 位运算 ==========

    and(dest, a, b) {
        this._emit(OpCode.AND, [dest, a, b]);
        this.backend.and(dest, a, b);
    }

    or(dest, a, b) {
        this._emit(OpCode.OR, [dest, a, b]);
        this.backend.or(dest, a, b);
    }

    xor(dest, a, b) {
        this._emit(OpCode.XOR, [dest, a, b]);
        this.backend.xor(dest, a, b);
    }

    shl(dest, src, count) {
        this._emit(OpCode.SHL, [dest, src, count]);
        this.backend.shl(dest, src, count);
    }

    shlImm(dest, src, imm) {
        this._emit(OpCode.SHL_IMM, [dest, src, imm]);
        this.backend.shlImm(dest, src, imm);
    }

    shr(dest, src, count) {
        this._emit(OpCode.SHR, [dest, src, count]);
        this.backend.shr(dest, src, count);
    }

    shrImm(dest, src, imm) {
        this._emit(OpCode.SHR_IMM, [dest, src, imm]);
        this.backend.shrImm(dest, src, imm);
    }

    // 算术右移 (保留符号位)
    sar(dest, src, count) {
        this._emit(OpCode.SAR, [dest, src, count]);
        this.backend.sar(dest, src, count);
    }

    sarImm(dest, src, imm) {
        this._emit(OpCode.SAR_IMM, [dest, src, imm]);
        this.backend.sarImm(dest, src, imm);
    }

    // 按位非
    not(dest, src) {
        this._emit(OpCode.NOT, [dest, src]);
        this.backend.not(dest, src);
    }

    // 取反 (0 - x)
    neg(dest, src) {
        this._emit(OpCode.NEG, [dest, src]);
        this.backend.neg(dest, src);
    }

    // 位测试 (AND but only sets flags)
    test(a, b) {
        this._emit(OpCode.TEST, [a, b]);
        this.backend.test(a, b);
    }

    testImm(a, imm) {
        this._emit(OpCode.TEST_IMM, [a, imm]);
        this.backend.testImm(a, imm);
    }

    // 立即数版本的位运算
    andImm(dest, src, imm) {
        this._emit(OpCode.AND_IMM, [dest, src, imm]);
        this.backend.andImm(dest, src, imm);
    }

    orImm(dest, src, imm) {
        this._emit(OpCode.OR_IMM, [dest, src, imm]);
        this.backend.orImm(dest, src, imm);
    }

    xorImm(dest, src, imm) {
        this._emit(OpCode.XOR_IMM, [dest, src, imm]);
        this.backend.xorImm(dest, src, imm);
    }

    // 无符号比较跳转
    jb(label) {
        this._emit(OpCode.JB, [label]);
        this.backend.jb(label);
    }

    jbe(label) {
        this._emit(OpCode.JBE, [label]);
        this.backend.jbe(label);
    }

    ja(label) {
        this._emit(OpCode.JA, [label]);
        this.backend.ja(label);
    }

    jae(label) {
        this._emit(OpCode.JAE, [label]);
        this.backend.jae(label);
    }

    // 系统调用
    syscall(num) {
        this._emit(OpCode.SYSCALL, [num]);
        this.backend.syscall(num);
    }

    // Windows API 调用
    callWindowsWriteConsole() {
        this._emit(OpCode.CALL_WIN_WRITE, []);
        if (this.backend.callWindowsWriteConsole) {
            this.backend.callWindowsWriteConsole();
        }
    }

    callWindowsExitProcess() {
        this._emit(OpCode.CALL_WIN_EXIT, []);
        if (this.backend.callWindowsExitProcess) {
            this.backend.callWindowsExitProcess();
        }
    }

    // Windows API 通用调用 (通过 IAT slot)
    callWindowsAPI(slotIndex) {
        this._emit(OpCode.CALL_WIN_API, [slotIndex]);
        if (this.backend.callWindowsAPI) {
            this.backend.callWindowsAPI(slotIndex);
        }
    }

    // Windows API 调用 (通过函数名或 slot)
    callIAT(funcNameOrSlot) {
        this._emit(OpCode.CALL_IAT, [funcNameOrSlot]);
        if (this.backend.callIAT) {
            this.backend.callIAT(funcNameOrSlot);
        }
    }

    // ========== 比较与跳转 ==========

    cmp(a, b) {
        this._emit(OpCode.CMP, [a, b]);
        this.backend.cmp(a, b);
    }

    cmpImm(a, imm) {
        this._emit(OpCode.CMP_IMM, [a, imm]);
        this.backend.cmpImm(a, imm);
    }

    jmp(label) {
        this._emit(OpCode.JMP, [label]);
        this.backend.jmp(label);
    }

    jeq(label) {
        this._emit(OpCode.JEQ, [label]);
        this.backend.jeq(label);
    }

    jne(label) {
        this._emit(OpCode.JNE, [label]);
        this.backend.jne(label);
    }

    jlt(label) {
        this._emit(OpCode.JLT, [label]);
        this.backend.jlt(label);
    }

    jle(label) {
        this._emit(OpCode.JLE, [label]);
        this.backend.jle(label);
    }

    jgt(label) {
        this._emit(OpCode.JGT, [label]);
        this.backend.jgt(label);
    }

    jge(label) {
        this._emit(OpCode.JGE, [label]);
        this.backend.jge(label);
    }

    // ========== 函数调用 ==========

    // 函数序言
    prologue(stackSize, savedRegs) {
        this._emit(OpCode.PROLOGUE, [stackSize, savedRegs]);
        this.backend.prologue(stackSize, savedRegs || []);
    }

    // 函数尾声
    epilogue(savedRegs, stackSize) {
        this._emit(OpCode.EPILOGUE, [savedRegs, stackSize]);
        this.backend.epilogue(savedRegs || [], stackSize || 0);
    }

    // 调用函数
    call(label) {
        this._emit(OpCode.CALL, [label]);
        this.backend.call(label);
    }

    // 间接调用（通过寄存器）
    callIndirect(reg) {
        this._emit(OpCode.CALL_INDIRECT, [reg]);
        if (this.backend.callIndirect) {
            this.backend.callIndirect(reg);
        } else {
            // 后备实现
            this.backend.callReg(reg);
        }
    }

    // 间接跳转（通过寄存器，不保存返回地址）
    jmpIndirect(reg) {
        this._emit(OpCode.JMP_INDIRECT, [reg]);
        this.backend.jmpIndirect(reg);
    }

    // 返回
    ret() {
        this._emit(OpCode.RET, []);
        this.backend.ret();
    }

    // ========== 高级调用辅助 ==========

    // 准备函数调用参数
    // args: [{ reg: VReg, value: VReg|number }]
    prepareCall(args) {
        this.backend.prepareCall(args);
    }

    // 获取第 n 个参数寄存器
    getArgReg(n) {
        return this.backend.getArgReg(n);
    }

    // 获取返回值寄存器
    getRetReg() {
        return VReg.RET;
    }

    // ========== 栈操作 ==========

    push(reg) {
        this._emit(OpCode.PUSH, [reg]);
        this.backend.push(reg);
    }

    pop(reg) {
        this._emit(OpCode.POP, [reg]);
        this.backend.pop(reg);
    }

    // ========== 标签与其他 ==========

    label(name) {
        this._emit(OpCode.LABEL, [name]);
        this.backend.label(name);
    }

    nop() {
        this._emit(OpCode.NOP, []);
        this.backend.nop();
    }

    // Float to Int conversion (for array indexing etc.)
    // Takes a Number object and extracts integer value
    f2i(dest, src) {
        this._emit(OpCode.F2I, [dest, src]);
        this.backend.f2i(dest, src);
    }

    // ========== 浮点运算 (跨平台抽象) ==========

    // 将整数寄存器的位模式移动到浮点寄存器
    // fpReg: 浮点寄存器编号 (0-7), gpReg: 虚拟寄存器
    fmovToFloat(fpReg, gpReg) {
        this._emit(OpCode.FMOV_TO_FLOAT, [fpReg, gpReg]);
        this.backend.fmovToFloat(fpReg, gpReg);
    }

    // 将浮点寄存器的位模式移动到整数寄存器
    fmovToInt(gpReg, fpReg) {
        this._emit(OpCode.FMOV_TO_INT, [gpReg, fpReg]);
        this.backend.fmovToInt(gpReg, fpReg);
    }

    // 浮点加法: fpDest = fpA + fpB
    fadd(fpDest, fpA, fpB) {
        this._emit(OpCode.FADD, [fpDest, fpA, fpB]);
        this.backend.fadd(fpDest, fpA, fpB);
    }

    // 浮点减法: fpDest = fpA - fpB
    fsub(fpDest, fpA, fpB) {
        this._emit(OpCode.FSUB, [fpDest, fpA, fpB]);
        this.backend.fsub(fpDest, fpA, fpB);
    }

    // 浮点乘法: fpDest = fpA * fpB
    fmul(fpDest, fpA, fpB) {
        this._emit(OpCode.FMUL, [fpDest, fpA, fpB]);
        this.backend.fmul(fpDest, fpA, fpB);
    }

    // 浮点除法: fpDest = fpA / fpB
    fdiv(fpDest, fpA, fpB) {
        this._emit(OpCode.FDIV, [fpDest, fpA, fpB]);
        this.backend.fdiv(fpDest, fpA, fpB);
    }

    // 浮点转整数 (截断): gpDest = trunc(fpSrc)
    fcvtzs(gpDest, fpSrc) {
        this._emit(OpCode.FCVTZS, [gpDest, fpSrc]);
        this.backend.fcvtzs(gpDest, fpSrc);
    }

    // 浮点取模: fpDest = fpA % fpB
    fmod(fpDest, fpA, fpB) {
        this._emit(OpCode.FMOD, [fpDest, fpA, fpB]);
        this.backend.fmod(fpDest, fpA, fpB);
    }

    // 浮点比较与零
    fcmpZero(fpReg) {
        this._emit(OpCode.FCMP_ZERO, [fpReg]);
        this.backend.fcmpZero(fpReg);
    }

    // 浮点绝对值: fpDest = abs(fpSrc)
    fabs(fpDest, fpSrc) {
        this._emit(OpCode.FABS, [fpDest, fpSrc]);
        this.backend.fabs(fpDest, fpSrc);
    }

    // 浮点截断: fpDest = trunc(fpSrc)
    ftrunc(fpDest, fpSrc) {
        this._emit(OpCode.FTRUNC, [fpDest, fpSrc]);
        this.backend.ftrunc(fpDest, fpSrc);
    }

    // 整数转浮点: fpDest = (double)gpSrc
    scvtf(fpDest, gpSrc) {
        this._emit(OpCode.SCVTF, [fpDest, gpSrc]);
        this.backend.scvtf(fpDest, gpSrc);
    }

    // 双精度转单精度: fpDest = (float)fpSrc
    fcvtd2s(fpDest, fpSrc) {
        this._emit(OpCode.FCVT_D2S, [fpDest, fpSrc]);
        this.backend.fcvtd2s(fpDest, fpSrc);
    }

    // 单精度转双精度: fpDest = (double)fpSrc
    fcvts2d(fpDest, fpSrc) {
        this._emit(OpCode.FCVT_S2D, [fpDest, fpSrc]);
        this.backend.fcvts2d(fpDest, fpSrc);
    }

    // 将单精度浮点寄存器的位模式移到整数寄存器 (32位)
    fmovToIntSingle(gpDest, fpSrc) {
        this._emit(OpCode.FMOV_TO_INT_SINGLE, [gpDest, fpSrc]);
        this.backend.fmovToIntSingle(gpDest, fpSrc);
    }

    // 将单精度整数位模式移到浮点寄存器
    fmovToFloatSingle(fpDest, gpSrc) {
        this._emit(OpCode.FMOV_TO_FLOAT_SINGLE, [fpDest, gpSrc]);
        this.backend.fmovToFloatSingle(fpDest, gpSrc);
    }

    // 浮点比较两个寄存器
    fcmp(fpA, fpB) {
        this._emit(OpCode.FCMP, [fpA, fpB]);
        this.backend.fcmp(fpA, fpB);
    }

    // 浮点移动 (寄存器间)
    fmov(fpDest, fpSrc) {
        this._emit(OpCode.FMOV, [fpDest, fpSrc]);
        this.backend.fmov(fpDest, fpSrc);
    }

    // ========== 辅助方法 ==========

    _emit(op, operands) {
        this.instructions.push(new Instruction(op, operands));
    }

    // 获取底层汇编器（用于特殊情况）
    getAsm() {
        return this.backend.asm;
    }

    // 清空指令记录
    reset() {
        this.instructions = [];
    }

    // 打印指令序列（调试用）
    dump() {
        for (let inst of this.instructions) {
            console.log("  " + inst.toString());
        }
    }
}

export { VReg } from "./registers.js";
export { OpCode } from "./instructions.js";
