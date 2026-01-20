// JSBin ARM64 后端
// 将虚拟指令翻译为 ARM64 机器码

import { Backend } from "./base.js";
import { VReg } from "../vm/registers.js";

// ARM64 物理寄存器（从 bootstrap 借用概念）
export const Reg = {
    X0: 0,
    X1: 1,
    X2: 2,
    X3: 3,
    X4: 4,
    X5: 5,
    X6: 6,
    X7: 7,
    X8: 8,
    X9: 9,
    X10: 10,
    X11: 11,
    X12: 12,
    X13: 13,
    X14: 14,
    X15: 15,
    X16: 16,
    X17: 17,
    X18: 18,
    X19: 19,
    X20: 20,
    X21: 21,
    X22: 22,
    X23: 23,
    X24: 24,
    X25: 25,
    X26: 26,
    X27: 27,
    X28: 28,
    FP: 29,
    LR: 30,
    SP: 31,
    XZR: 31,
};

export class ARM64Backend extends Backend {
    constructor(asm, platform) {
        super(asm);
        this.platform = platform || "linux"; // "linux" | "macos"

        // 虚拟寄存器 -> ARM64 物理寄存器映射
        this.regMap = {
            // 通用/临时寄存器
            [VReg.V0]: Reg.X0,
            [VReg.V1]: Reg.X1,
            [VReg.V2]: Reg.X2,
            [VReg.V3]: Reg.X3,
            [VReg.V4]: Reg.X4,
            [VReg.V5]: Reg.X5,
            [VReg.V6]: Reg.X6,
            [VReg.V7]: Reg.X7,

            // Callee-saved 寄存器
            [VReg.S0]: Reg.X19,
            [VReg.S1]: Reg.X20,
            [VReg.S2]: Reg.X21,
            [VReg.S3]: Reg.X22,
            [VReg.S4]: Reg.X23,
            [VReg.S5]: Reg.X24,

            // 参数寄存器
            [VReg.A0]: Reg.X0,
            [VReg.A1]: Reg.X1,
            [VReg.A2]: Reg.X2,
            [VReg.A3]: Reg.X3,
            [VReg.A4]: Reg.X4,
            [VReg.A5]: Reg.X5,

            // 特殊寄存器
            [VReg.RET]: Reg.X0,
            [VReg.FP]: Reg.FP,
            [VReg.SP]: Reg.SP,
            [VReg.LR]: Reg.LR,
        };
    }

    get name() {
        return "arm64";
    }

    mapReg(vreg) {
        const phys = this.regMap[vreg];
        if (phys === undefined) {
            throw new Error("Unknown virtual register: " + vreg);
        }
        return phys;
    }

    // ========== 数据移动 ==========

    mov(dest, src) {
        this.asm.movReg(this.mapReg(dest), this.mapReg(src));
    }

    movImm(dest, imm) {
        this.asm.movImm(this.mapReg(dest), imm);
    }

    movImm64(dest, imm) {
        // 64位立即数，直接使用 asm.movImm64
        this.asm.movImm64(this.mapReg(dest), imm);
    }

    load(dest, base, offset) {
        const rd = this.mapReg(dest);
        const rb = this.mapReg(base);
        if (offset >= -256 && offset <= 255) {
            // LDUR/LDR 可以直接使用的范围
            if (offset < 0) {
                this.asm.ldur(rd, rb, offset);
            } else {
                this.asm.ldr(rd, rb, offset);
            }
        } else if (offset >= 0 && (offset & 7) === 0 && offset < 32768) {
            // 正偏移且 8 字节对齐，可以使用 LDR 的 scaled offset
            this.asm.ldr(rd, rb, offset);
        } else {
            // 超出范围：使用 X16 作为临时寄存器计算地址
            if (offset >= -4095 && offset <= 4095) {
                if (offset >= 0) {
                    this.asm.addImm(Reg.X16, rb, offset);
                } else {
                    this.asm.subImm(Reg.X16, rb, -offset);
                }
            } else {
                // 超大偏移：先 MOV offset 到 X16，再 ADD
                this.asm.movImm(Reg.X16, offset);
                this.asm.addReg(Reg.X16, rb, Reg.X16);
            }
            this.asm.ldr(rd, Reg.X16, 0);
        }
    }

    store(base, offset, src) {
        const rs = this.mapReg(src);
        const rb = this.mapReg(base);
        if (offset >= -256 && offset <= 255) {
            // STUR/STR 可以直接使用的范围
            if (offset < 0) {
                this.asm.stur(rs, rb, offset);
            } else {
                this.asm.str(rs, rb, offset);
            }
        } else if (offset >= 0 && (offset & 7) === 0 && offset < 32768) {
            // 正偏移且 8 字节对齐，可以使用 STR 的 scaled offset
            this.asm.str(rs, rb, offset);
        } else {
            // 超出范围：使用 X16 作为临时寄存器计算地址
            // ADD X16, base, #offset （可能需要多条指令）
            if (offset >= -4095 && offset <= 4095) {
                if (offset >= 0) {
                    this.asm.addImm(Reg.X16, rb, offset);
                } else {
                    this.asm.subImm(Reg.X16, rb, -offset);
                }
            } else {
                // 超大偏移：先 MOV offset 到 X16，再 ADD
                this.asm.movImm(Reg.X16, offset);
                this.asm.addReg(Reg.X16, rb, Reg.X16);
            }
            this.asm.str(rs, Reg.X16, 0);
        }
    }

    // 存储字节 (8位)
    storeByte(base, offset, src) {
        const rs = this.mapReg(src);
        const rb = this.mapReg(base);
        this.asm.strb(rs, rb, offset);
    }

    // 加载字节 (零扩展到64位)
    loadByte(dest, base, offset) {
        const rd = this.mapReg(dest);
        const rb = this.mapReg(base);
        this.asm.ldrb(rd, rb, offset);
    }

    lea(dest, label) {
        this.asm.adr(this.mapReg(dest), label);
    }

    // ========== 算术运算 ==========

    add(dest, a, b) {
        this.asm.addReg(this.mapReg(dest), this.mapReg(a), this.mapReg(b));
    }

    addImm(dest, src, imm) {
        this.asm.addImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    sub(dest, a, b) {
        this.asm.subReg(this.mapReg(dest), this.mapReg(a), this.mapReg(b));
    }

    subImm(dest, src, imm) {
        this.asm.subImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    mul(dest, a, b) {
        this.asm.mul(this.mapReg(dest), this.mapReg(a), this.mapReg(b));
    }

    div(dest, a, b) {
        this.asm.sdiv(this.mapReg(dest), this.mapReg(a), this.mapReg(b));
    }

    mod(dest, a, b) {
        // ARM64 没有直接的取模指令: a % b = a - (a / b) * b
        const rd = this.mapReg(dest);
        const ra = this.mapReg(a);
        const rb = this.mapReg(b);
        this.asm.sdiv(Reg.X9, ra, rb); // X9 = a / b
        this.asm.msub(rd, Reg.X9, rb, ra); // rd = a - X9 * b
    }

    // ========== 位运算 ==========

    and(dest, a, b) {
        this.asm.andReg(this.mapReg(dest), this.mapReg(a), this.mapReg(b));
    }

    or(dest, a, b) {
        this.asm.orrReg(this.mapReg(dest), this.mapReg(a), this.mapReg(b));
    }

    xor(dest, a, b) {
        this.asm.eorReg(this.mapReg(dest), this.mapReg(a), this.mapReg(b));
    }

    shl(dest, src, count) {
        if (typeof count === "number") {
            this.asm.lslImm(this.mapReg(dest), this.mapReg(src), count);
        } else {
            this.asm.lslReg(this.mapReg(dest), this.mapReg(src), this.mapReg(count));
        }
    }

    shlImm(dest, src, imm) {
        this.asm.lslImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    shr(dest, src, count) {
        if (typeof count === "number") {
            this.asm.lsrImm(this.mapReg(dest), this.mapReg(src), count);
        } else {
            this.asm.lsrReg(this.mapReg(dest), this.mapReg(src), this.mapReg(count));
        }
    }

    shrImm(dest, src, imm) {
        this.asm.lsrImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    // 算术右移 (保留符号位)
    sar(dest, src, count) {
        if (typeof count === "number") {
            this.asm.asrImm(this.mapReg(dest), this.mapReg(src), count);
        } else {
            this.asm.asrReg(this.mapReg(dest), this.mapReg(src), this.mapReg(count));
        }
    }

    sarImm(dest, src, imm) {
        this.asm.asrImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    // 按位非: dest = ~src
    not(dest, src) {
        this.asm.mvn(this.mapReg(dest), this.mapReg(src));
    }

    // 取反: dest = 0 - src
    neg(dest, src) {
        this.asm.negReg(this.mapReg(dest), this.mapReg(src));
    }

    // 位测试
    test(a, b) {
        this.asm.tst(this.mapReg(a), this.mapReg(b));
    }

    testImm(a, imm) {
        this.asm.tstImm(this.mapReg(a), imm);
    }

    // 立即数版本的位运算
    andImm(dest, src, imm) {
        this.asm.andImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    orImm(dest, src, imm) {
        this.asm.orrImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    xorImm(dest, src, imm) {
        this.asm.eorImm(this.mapReg(dest), this.mapReg(src), imm);
    }

    // ========== 比较与跳转 ==========

    cmp(a, b) {
        this.asm.cmpReg(this.mapReg(a), this.mapReg(b));
    }

    cmpImm(a, imm) {
        this.asm.cmpImm(this.mapReg(a), imm);
    }

    jmp(label) {
        this.asm.b(label);
    }

    jeq(label) {
        this.asm.beq(label);
    }

    jne(label) {
        this.asm.bne(label);
    }

    jlt(label) {
        this.asm.blt(label);
    }

    jle(label) {
        this.asm.ble(label);
    }

    jgt(label) {
        this.asm.bgt(label);
    }

    jge(label) {
        this.asm.bge(label);
    }

    // 无符号比较跳转
    jb(label) {
        // Below (无符号小于): C=0
        this.asm.blo(label);
    }

    jbe(label) {
        // Below or Equal (无符号小于等于): C=0 or Z=1
        this.asm.bls(label);
    }

    ja(label) {
        // Above (无符号大于): C=1 and Z=0
        this.asm.bhi(label);
    }

    jae(label) {
        // Above or Equal (无符号大于等于): C=1
        this.asm.bhs(label);
    }

    // ========== 函数调用 ==========

    prologue(stackSize, savedRegs) {
        // 保存 FP 和 LR
        this.asm.stpPre(Reg.FP, Reg.LR, Reg.SP, -16);
        this.asm.movReg(Reg.FP, Reg.SP);

        // 保存 callee-saved 寄存器
        for (let i = 0; i < savedRegs.length; i += 2) {
            const r1 = this.mapReg(savedRegs[i]);
            const r2 = i + 1 < savedRegs.length ? this.mapReg(savedRegs[i + 1]) : Reg.XZR;
            this.asm.stpPre(r1, r2, Reg.SP, -16);
        }

        // 分配栈空间
        if (stackSize > 0) {
            this.asm.subImm(Reg.SP, Reg.SP, stackSize);
        }
    }

    epilogue(savedRegs, stackSize) {
        // 恢复栈空间
        if (stackSize > 0) {
            this.asm.addImm(Reg.SP, Reg.SP, stackSize);
        }

        // 恢复 callee-saved 寄存器（反序）
        // 计算最后一对的起始索引（考虑奇数情况）
        const numPairs = Math.ceil(savedRegs.length / 2);
        for (let p = numPairs - 1; p >= 0; p--) {
            const i = p * 2;
            const r1 = this.mapReg(savedRegs[i]);
            const r2 = i + 1 < savedRegs.length ? this.mapReg(savedRegs[i + 1]) : Reg.XZR;
            this.asm.ldpPost(r1, r2, Reg.SP, 16);
        }

        // 恢复 FP 和 LR
        this.asm.ldpPost(Reg.FP, Reg.LR, Reg.SP, 16);
        this.asm.ret();
    }

    call(label) {
        this.asm.bl(label);
    }

    callIndirect(reg) {
        // BLR Xn - 间接调用
        this.asm.blr(this.mapReg(reg));
    }

    jmpIndirect(reg) {
        // BR Xn - 间接跳转 (不保存返回地址)
        this.asm.br(this.mapReg(reg));
    }

    ret() {
        this.asm.ret();
    }

    prepareCall(args) {
        // 将参数放入寄存器
        for (let i = 0; i < args.length && i < 8; i++) {
            const arg = args[i];
            if (typeof arg === "number") {
                this.asm.movImm(i, arg); // X0-X7
            } else {
                this.asm.movReg(i, this.mapReg(arg));
            }
        }
    }

    // ========== 栈操作 ==========

    push(reg) {
        this.asm.stpPre(this.mapReg(reg), Reg.XZR, Reg.SP, -16);
    }

    pop(reg) {
        this.asm.ldpPost(this.mapReg(reg), Reg.XZR, Reg.SP, 16);
    }

    // ========== 系统调用 ==========

    syscall(num) {
        if (this.platform === "linux") {
            this.asm.movImm(Reg.X8, num);
            this.asm.svc(0);
        } else {
            // macOS
            this.asm.movImm(Reg.X16, num);
            this.asm.svc(128);
        }
    }

    // ========== 类型转换 ==========

    // Float to Int: 从 Number 对象中提取整数值
    // src 是指向 Number 对象的指针，dest 接收整数值
    f2i(dest, src) {
        const rd = this.mapReg(dest);
        const rs = this.mapReg(src);
        // Number 对象: offset 0 = type, offset 8 = float64 bits
        // 加载 float64 位模式
        this.asm.ldr(Reg.X9, rs, 8); // X9 = float64 bits
        // 将位模式移到 D0
        this.asm.fmovToFloat(0, Reg.X9); // D0 = float from bits
        // 转换为整数
        this.asm.fcvtzs(rd, 0); // rd = int(D0)
    }

    // ========== 浮点运算 (VM 抽象接口实现) ==========

    // 将整数寄存器的位模式移动到浮点寄存器
    fmovToFloat(fpReg, gpReg) {
        this.asm.fmovToFloat(fpReg, this.mapReg(gpReg));
    }

    // 将浮点寄存器的位模式移动到整数寄存器
    fmovToInt(gpReg, fpReg) {
        this.asm.fmovToInt(this.mapReg(gpReg), fpReg);
    }

    // 浮点加法
    fadd(fpDest, fpA, fpB) {
        this.asm.fadd(fpDest, fpA, fpB);
    }

    // 浮点减法
    fsub(fpDest, fpA, fpB) {
        this.asm.fsub(fpDest, fpA, fpB);
    }

    // 浮点乘法
    fmul(fpDest, fpA, fpB) {
        this.asm.fmul(fpDest, fpA, fpB);
    }

    // 浮点除法
    fdiv(fpDest, fpA, fpB) {
        this.asm.fdiv(fpDest, fpA, fpB);
    }

    // 浮点转整数 (截断)
    fcvtzs(gpDest, fpSrc) {
        this.asm.fcvtzs(this.mapReg(gpDest), fpSrc);
    }

    // 浮点取模: fpDest = fpA % fpB
    fmod(fpDest, fpA, fpB) {
        // 浮点取模: a % b = a - trunc(a / b) * b
        // 使用 D7 作为临时寄存器
        this.asm.fdiv(7, fpA, fpB); // D7 = a / b
        this.asm.frintz(7, 7); // D7 = trunc(D7)
        this.asm.fmul(7, 7, fpB); // D7 = D7 * b
        this.asm.fsub(fpDest, fpA, 7); // fpDest = a - D7
    }

    // 浮点与零比较
    fcmpZero(fpReg) {
        this.asm.fcmpZero(fpReg);
    }

    // 浮点绝对值
    fabs(fpDest, fpSrc) {
        this.asm.fabs(fpDest, fpSrc);
    }

    // 浮点截断
    ftrunc(fpDest, fpSrc) {
        this.asm.frintz(fpDest, fpSrc);
    }

    // 整数转浮点: fpDest = (double)gpSrc
    scvtf(fpDest, gpSrc) {
        this.asm.scvtf(fpDest, this.mapReg(gpSrc));
    }

    // 双精度转单精度
    fcvtd2s(fpDest, fpSrc) {
        this.asm.fcvt(fpDest, fpSrc, "d", "s");
    }

    // 单精度转双精度
    fcvts2d(fpDest, fpSrc) {
        this.asm.fcvt(fpDest, fpSrc, "s", "d");
    }

    // 将单精度浮点寄存器的位模式移到整数寄存器 (32位)
    fmovToIntSingle(gpDest, fpSrc) {
        this.asm.fmovToIntSingle(this.mapReg(gpDest), fpSrc);
    }

    // 将单精度整数位模式移到浮点寄存器
    fmovToFloatSingle(fpDest, gpSrc) {
        this.asm.fmovToFloatSingle(fpDest, this.mapReg(gpSrc));
    }

    // 浮点比较
    fcmp(fpA, fpB) {
        this.asm.fcmp(fpA, fpB);
    }

    // 浮点寄存器间移动
    fmov(fpDest, fpSrc) {
        this.asm.fmovReg(fpDest, fpSrc);
    }
}
