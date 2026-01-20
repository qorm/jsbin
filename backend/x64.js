// JSBin x64 后端
// 将虚拟指令翻译为 x86_64 机器码

import { Backend } from "./base.js";
import { VReg } from "../vm/registers.js";

// x64 物理寄存器
export const Reg = {
    RAX: 0,
    RCX: 1,
    RDX: 2,
    RBX: 3,
    RSP: 4,
    RBP: 5,
    RSI: 6,
    RDI: 7,
    R8: 8,
    R9: 9,
    R10: 10,
    R11: 11,
    R12: 12,
    R13: 13,
    R14: 14,
    R15: 15,
};

export class X64Backend extends Backend {
    constructor(asm, platform) {
        super(asm);
        this.platform = platform || "linux"; // "linux" | "macos" | "windows"

        // System V ABI (Linux/macOS) vs Windows ABI
        const isWindows = platform === "windows";

        // x64 只有 5 个 callee-saved 寄存器，S5 需要使用栈槽位
        this.s5StackOffset = -8; // S5 在栈上的偏移量（相对于 RBP）

        // 虚拟寄存器 -> x64 物理寄存器映射
        this.regMap = {
            // 通用/临时寄存器
            [VReg.V0]: Reg.RAX,
            [VReg.V1]: Reg.RCX,
            [VReg.V2]: Reg.RDX,
            [VReg.V3]: Reg.R8,
            [VReg.V4]: Reg.R9,
            [VReg.V5]: Reg.R10,
            [VReg.V6]: Reg.R11,
            [VReg.V7]: Reg.RSI,

            // Callee-saved 寄存器
            [VReg.S0]: Reg.RBX,
            [VReg.S1]: Reg.R12,
            [VReg.S2]: Reg.R13,
            [VReg.S3]: Reg.R14,
            [VReg.S4]: Reg.R15,
            // S5 使用栈槽位，不在 regMap 中

            // 参数寄存器 - 根据 ABI 不同
            [VReg.A0]: isWindows ? Reg.RCX : Reg.RDI,
            [VReg.A1]: isWindows ? Reg.RDX : Reg.RSI,
            [VReg.A2]: isWindows ? Reg.R8 : Reg.RDX,
            [VReg.A3]: isWindows ? Reg.R9 : Reg.RCX,
            [VReg.A4]: Reg.R8, // Windows: stack, SysV: R8
            [VReg.A5]: Reg.R9, // Windows: stack, SysV: R9

            // 特殊寄存器
            [VReg.RET]: Reg.RAX,
            [VReg.FP]: Reg.RBP,
            [VReg.SP]: Reg.RSP,
            [VReg.LR]: Reg.RAX, // x64 没有 LR，用 RAX 占位
        };

        // 参数传递顺序
        this.callRegs = isWindows ? [Reg.RCX, Reg.RDX, Reg.R8, Reg.R9] : [Reg.RDI, Reg.RSI, Reg.RDX, Reg.RCX, Reg.R8, Reg.R9];
    }

    get name() {
        return "x64";
    }

    mapReg(vreg) {
        // S5 使用栈槽位，不能直接映射
        if (vreg === VReg.S5) {
            throw new Error("S5 uses stack slot on x64, cannot map directly. Use mov/load/store with S5 handling.");
        }
        const phys = this.regMap[vreg];
        if (phys === undefined) {
            throw new Error("Unknown virtual register: " + vreg);
        }
        return phys;
    }

    // 检查是否是 S5
    isS5(vreg) {
        return vreg === VReg.S5;
    }

    // ========== 数据移动 ==========

    mov(dest, src) {
        // 处理 S5 (栈槽位)
        if (this.isS5(dest) && this.isS5(src)) {
            // S5 到 S5：无操作
            return;
        }
        if (this.isS5(dest)) {
            // mov S5, src -> store to stack
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, this.mapReg(src));
            return;
        }
        if (this.isS5(src)) {
            // mov dest, S5 -> load from stack
            this.asm.movLoadOffset(this.mapReg(dest), Reg.RBP, this.s5StackOffset);
            return;
        }
        this.asm.movReg(this.mapReg(dest), this.mapReg(src));
    }

    movImm(dest, imm) {
        if (this.isS5(dest)) {
            // movImm S5, imm -> 需要临时寄存器
            if (imm === 0) {
                this.asm.xorReg(Reg.RAX, Reg.RAX);
            } else {
                this.asm.movImm(Reg.RAX, imm);
            }
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.RAX);
            return;
        }
        if (imm === 0) {
            this.asm.xorReg(this.mapReg(dest), this.mapReg(dest));
        } else {
            this.asm.movImm(this.mapReg(dest), imm);
        }
    }

    movImm64(dest, imm) {
        // 64位立即数，对于 x64 直接使用 asm.movImm64
        if (this.isS5(dest)) {
            this.asm.movImm64(Reg.RAX, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.RAX);
            return;
        }
        this.asm.movImm64(this.mapReg(dest), imm);
    }

    load(dest, base, offset) {
        // 处理 S5 作为 dest 或 base
        if (this.isS5(base)) {
            // load dest, [S5 + offset] -> 先加载 S5 到临时寄存器
            this.asm.movLoadOffset(Reg.RAX, Reg.RBP, this.s5StackOffset);
            if (this.isS5(dest)) {
                // load S5, [S5 + offset]
                this.asm.movLoadOffset(Reg.RAX, Reg.RAX, offset);
                this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.RAX);
            } else {
                this.asm.movLoadOffset(this.mapReg(dest), Reg.RAX, offset);
            }
            return;
        }
        if (this.isS5(dest)) {
            // load S5, [base + offset]
            this.asm.movLoadOffset(Reg.RAX, this.mapReg(base), offset);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.RAX);
            return;
        }
        this.asm.movLoadOffset(this.mapReg(dest), this.mapReg(base), offset);
    }

    store(base, offset, src) {
        // 处理 S5 作为 base 或 src
        if (this.isS5(base)) {
            // store [S5 + offset], src
            this.asm.movLoadOffset(Reg.RAX, Reg.RBP, this.s5StackOffset);
            if (this.isS5(src)) {
                // store [S5 + offset], S5 -> 需要两个临时寄存器
                this.asm.push(Reg.RCX);
                this.asm.movLoadOffset(Reg.RCX, Reg.RBP, this.s5StackOffset);
                this.asm.movStoreOffset(Reg.RAX, offset, Reg.RCX);
                this.asm.pop(Reg.RCX);
            } else {
                this.asm.movStoreOffset(Reg.RAX, offset, this.mapReg(src));
            }
            return;
        }
        if (this.isS5(src)) {
            // store [base + offset], S5
            this.asm.movLoadOffset(Reg.RAX, Reg.RBP, this.s5StackOffset);
            this.asm.movStoreOffset(this.mapReg(base), offset, Reg.RAX);
            return;
        }
        this.asm.movStoreOffset(this.mapReg(base), offset, this.mapReg(src));
    }

    // 存储字节 (8位)
    storeByte(base, offset, src) {
        const rb = this._getReg(base, Reg.R10);
        const rs = this._getReg(src, Reg.R11);
        this.asm.movStoreOffset8(rb, offset, rs);
    }

    // 加载字节 (零扩展到64位)
    loadByte(dest, base, offset) {
        const tempReg = Reg.R10;
        const rb = this._getReg(base, tempReg);

        if (this.isS5(dest)) {
            // 需要另一个临时寄存器来存结果
            const tempResult = Reg.R11;
            this.asm.movLoadOffset8(tempResult, rb, offset);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempResult);
        } else {
            this.asm.movLoadOffset8(this.mapReg(dest), rb, offset);
        }
    }

    lea(dest, label) {
        if (this.isS5(dest)) {
            this.asm.leaRipRel(Reg.RAX, label);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.RAX);
            return;
        }
        this.asm.leaRipRel(this.mapReg(dest), label);
    }

    // 辅助：获取寄存器值（处理 S5）
    _getReg(vreg, tempReg = Reg.RAX) {
        if (this.isS5(vreg)) {
            this.asm.movLoadOffset(tempReg, Reg.RBP, this.s5StackOffset);
            return tempReg;
        }
        return this.mapReg(vreg);
    }

    // 辅助：设置寄存器值（处理 S5）
    _setReg(vreg, physReg) {
        if (this.isS5(vreg)) {
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, physReg);
            return;
        }
        if (this.mapReg(vreg) !== physReg) {
            this.asm.movReg(this.mapReg(vreg), physReg);
        }
    }

    // ========== 算术运算 ==========

    add(dest, a, b) {
        // 使用 R10 作为临时寄存器避免与参数冲突
        const tempA = Reg.R10;
        const tempB = Reg.R11;

        // 加载操作数
        const ra = this._getReg(a, tempA);
        const rb = this._getReg(b, tempB);

        // 执行运算
        if (this.isS5(dest)) {
            if (ra === tempA) {
                this.asm.addReg(tempA, rb);
            } else {
                this.asm.movReg(tempA, ra);
                this.asm.addReg(tempA, rb);
            }
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempA);
        } else {
            const rd = this.mapReg(dest);
            // 如果 dest == b，需要特别处理以避免覆盖 b 的值
            if (rd === rb && rd !== ra) {
                // dest == b, dest != a: 需要先把 b 存到临时寄存器
                this.asm.movReg(tempA, ra);
                this.asm.addReg(tempA, rb);
                this.asm.movReg(rd, tempA);
            } else if (rd !== ra) {
                this.asm.movReg(rd, ra);
                this.asm.addReg(rd, rb);
            } else {
                this.asm.addReg(rd, rb);
            }
        }
    }

    addImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.addImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.addImm(rd, imm);
        }
    }

    sub(dest, a, b) {
        const tempA = Reg.R10;
        const tempB = Reg.R11;

        const ra = this._getReg(a, tempA);
        const rb = this._getReg(b, tempB);

        if (this.isS5(dest)) {
            if (ra === tempA) {
                this.asm.subReg(tempA, rb);
            } else {
                this.asm.movReg(tempA, ra);
                this.asm.subReg(tempA, rb);
            }
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempA);
        } else {
            const rd = this.mapReg(dest);
            // 如果 dest == b，需要特别处理以避免覆盖 b 的值
            if (rd === rb && rd !== ra) {
                // dest == b, dest != a: 需要先把 a 和 b 存到临时寄存器
                this.asm.movReg(tempA, ra);
                this.asm.subReg(tempA, rb);
                this.asm.movReg(rd, tempA);
            } else if (rd !== ra) {
                this.asm.movReg(rd, ra);
                this.asm.subReg(rd, rb);
            } else {
                this.asm.subReg(rd, rb);
            }
        }
    }

    subImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.subImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.subImm(rd, imm);
        }
    }

    mul(dest, a, b) {
        const tempA = Reg.R10;
        const tempB = Reg.R11;

        const ra = this._getReg(a, tempA);
        const rb = this._getReg(b, tempB);

        if (this.isS5(dest)) {
            if (ra === tempA) {
                this.asm.imulReg(tempA, rb);
            } else {
                this.asm.movReg(tempA, ra);
                this.asm.imulReg(tempA, rb);
            }
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempA);
        } else {
            const rd = this.mapReg(dest);
            // 如果 dest == b，需要特别处理以避免覆盖 b 的值
            if (rd === rb && rd !== ra) {
                // dest == b, dest != a: 需要先把 a 存到临时寄存器
                this.asm.movReg(tempA, ra);
                this.asm.imulReg(tempA, rb);
                this.asm.movReg(rd, tempA);
            } else if (rd !== ra) {
                this.asm.movReg(rd, ra);
                this.asm.imulReg(rd, rb);
            } else {
                this.asm.imulReg(rd, rb);
            }
        }
    }

    div(dest, a, b) {
        // x64 除法: RAX / reg -> RAX (商), RDX (余数)
        const ra = this._getReg(a, Reg.R10);
        const rb = this._getReg(b, Reg.R11);

        // 检查目标是否是 RDX（会和 idiv 冲突）
        const destIsRDX = !this.isS5(dest) && this.mapReg(dest) === Reg.RDX;

        // 只有目标不是 RDX 时才保存 RDX
        if (!destIsRDX) {
            this.asm.push(Reg.RDX);
        }

        // 将被除数放入 RAX
        if (ra !== Reg.RAX) {
            this.asm.movReg(Reg.RAX, ra);
        }

        // 符号扩展 RAX -> RDX:RAX
        this.asm.cqo();

        // 如果 rb 是 R11（S5 加载用过），需要重新加载因为 cqo 可能破坏了
        let divisor = rb;
        if (this.isS5(b)) {
            this.asm.movLoadOffset(Reg.R11, Reg.RBP, this.s5StackOffset);
            divisor = Reg.R11;
        }

        // 除法
        this.asm.idivReg(divisor);

        // 结果在 RAX，移动到目标
        if (this.isS5(dest)) {
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.RAX);
            // 恢复 RDX
            this.asm.pop(Reg.RDX);
        } else {
            const rd = this.mapReg(dest);
            if (rd === Reg.RDX) {
                // 目标是 RDX，商已经需要放到 RDX
                // 但商在 RAX，需要移动
                this.asm.movReg(Reg.RDX, Reg.RAX);
                // 不需要 pop，因为我们没有 push
            } else {
                if (rd !== Reg.RAX) {
                    this.asm.movReg(rd, Reg.RAX);
                }
                // 恢复 RDX
                this.asm.pop(Reg.RDX);
            }
        }
    }

    mod(dest, a, b) {
        // 类似 div，但取余数 (RDX)
        const ra = this._getReg(a, Reg.R10);
        const rb = this._getReg(b, Reg.R11);

        // 检查目标是否是 RDX（余数就在 RDX）
        const destIsRDX = !this.isS5(dest) && this.mapReg(dest) === Reg.RDX;

        // 只有目标不是 RDX 时才保存 RDX
        if (!destIsRDX) {
            this.asm.push(Reg.RDX);
        }

        if (ra !== Reg.RAX) {
            this.asm.movReg(Reg.RAX, ra);
        }
        this.asm.cqo();

        // 如果 rb 是 R11（S5 加载用过），需要重新加载
        let divisor = rb;
        if (this.isS5(b)) {
            this.asm.movLoadOffset(Reg.R11, Reg.RBP, this.s5StackOffset);
            divisor = Reg.R11;
        }

        this.asm.idivReg(divisor);

        // 余数在 RDX，移动到目标
        if (this.isS5(dest)) {
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.RDX);
            // 恢复 RDX
            this.asm.pop(Reg.RDX);
        } else {
            const rd = this.mapReg(dest);
            if (rd === Reg.RDX) {
                // 目标就是 RDX，余数已经在那里，不需要任何操作
                // 也不需要 pop，因为我们没有 push
            } else {
                this.asm.movReg(rd, Reg.RDX);
                // 恢复 RDX
                this.asm.pop(Reg.RDX);
            }
        }
    }

    // ========== 位运算 ==========

    and(dest, a, b) {
        const tempReg = Reg.R10;
        const tempReg2 = Reg.R11;
        const ra = this._getReg(a, tempReg);
        const rb = this._getReg(b, tempReg2);

        if (this.isS5(dest)) {
            if (ra !== tempReg) {
                this.asm.movReg(tempReg, ra);
            }
            this.asm.andReg(tempReg, rb);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            // 如果 dest == b，需要特别处理以避免覆盖 b 的值
            if (rd === rb && rd !== ra) {
                this.asm.movReg(tempReg, ra);
                this.asm.andReg(tempReg, rb);
                this.asm.movReg(rd, tempReg);
            } else if (rd !== ra) {
                this.asm.movReg(rd, ra);
                this.asm.andReg(rd, rb);
            } else {
                this.asm.andReg(rd, rb);
            }
        }
    }

    or(dest, a, b) {
        const tempReg = Reg.R10;
        const tempReg2 = Reg.R11;
        const ra = this._getReg(a, tempReg);
        const rb = this._getReg(b, tempReg2);

        if (this.isS5(dest)) {
            if (ra !== tempReg) {
                this.asm.movReg(tempReg, ra);
            }
            this.asm.orReg(tempReg, rb);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            // 如果 dest == b，需要特别处理以避免覆盖 b 的值
            if (rd === rb && rd !== ra) {
                this.asm.movReg(tempReg, ra);
                this.asm.orReg(tempReg, rb);
                this.asm.movReg(rd, tempReg);
            } else if (rd !== ra) {
                this.asm.movReg(rd, ra);
                this.asm.orReg(rd, rb);
            } else {
                this.asm.orReg(rd, rb);
            }
        }
    }

    xor(dest, a, b) {
        const tempReg = Reg.R10;
        const tempReg2 = Reg.R11;
        const ra = this._getReg(a, tempReg);
        const rb = this._getReg(b, tempReg2);

        if (this.isS5(dest)) {
            if (ra !== tempReg) {
                this.asm.movReg(tempReg, ra);
            }
            this.asm.xorReg(tempReg, rb);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            // 如果 dest == b，需要特别处理以避免覆盖 b 的值
            if (rd === rb && rd !== ra) {
                this.asm.movReg(tempReg, ra);
                this.asm.xorReg(tempReg, rb);
                this.asm.movReg(rd, tempReg);
            } else if (rd !== ra) {
                this.asm.movReg(rd, ra);
                this.asm.xorReg(rd, rb);
            } else {
                this.asm.xorReg(rd, rb);
            }
        }
    }

    shl(dest, src, count) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            if (typeof count === "number") {
                this.asm.shlImm(tempReg, count);
            } else {
                this.asm.movReg(Reg.RCX, this._getReg(count, Reg.RCX));
                this.asm.shlCl(tempReg);
            }
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            if (typeof count === "number") {
                this.asm.shlImm(rd, count);
            } else {
                this.asm.movReg(Reg.RCX, this._getReg(count, Reg.RCX));
                this.asm.shlCl(rd);
            }
        }
    }

    shlImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.shlImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.shlImm(rd, imm);
        }
    }

    shr(dest, src, count) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            if (typeof count === "number") {
                this.asm.shrImm(tempReg, count);
            } else {
                this.asm.movReg(Reg.RCX, this._getReg(count, Reg.RCX));
                this.asm.shrCl(tempReg);
            }
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            if (typeof count === "number") {
                this.asm.shrImm(rd, count);
            } else {
                this.asm.movReg(Reg.RCX, this._getReg(count, Reg.RCX));
                this.asm.shrCl(rd);
            }
        }
    }

    shrImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.shrImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.shrImm(rd, imm);
        }
    }

    // 算术右移 (保留符号位)
    sar(dest, src, count) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            if (typeof count === "number") {
                this.asm.sarImm(tempReg, count);
            } else {
                this.asm.movReg(Reg.RCX, this._getReg(count, Reg.RCX));
                this.asm.sarCl(tempReg);
            }
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            if (typeof count === "number") {
                this.asm.sarImm(rd, count);
            } else {
                this.asm.movReg(Reg.RCX, this._getReg(count, Reg.RCX));
                this.asm.sarCl(rd);
            }
        }
    }

    sarImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.sarImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.sarImm(rd, imm);
        }
    }

    // 按位非: dest = ~src
    not(dest, src) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.not(tempReg);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.not(rd);
        }
    }

    // 取反: dest = 0 - src
    neg(dest, src) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.neg(tempReg);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.neg(rd);
        }
    }

    // 位测试
    test(a, b) {
        const ra = this._getReg(a, Reg.R10);
        const rb = this._getReg(b, Reg.R11);
        this.asm.testReg(ra, rb);
    }

    testImm(a, imm) {
        const ra = this._getReg(a, Reg.R10);
        this.asm.testImm(ra, imm);
    }

    // 立即数版本的位运算
    andImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.andImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.andImm(rd, imm);
        }
    }

    orImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.orImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.orImm(rd, imm);
        }
    }

    xorImm(dest, src, imm) {
        const tempReg = Reg.R10;
        const rs = this._getReg(src, tempReg);

        if (this.isS5(dest)) {
            if (rs !== tempReg) {
                this.asm.movReg(tempReg, rs);
            }
            this.asm.xorImm(tempReg, imm);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, tempReg);
        } else {
            const rd = this.mapReg(dest);
            if (rd !== rs) {
                this.asm.movReg(rd, rs);
            }
            this.asm.xorImm(rd, imm);
        }
    }

    // ========== 比较与跳转 ==========

    cmp(a, b) {
        const ra = this._getReg(a, Reg.R10);
        const rb = this._getReg(b, Reg.R11);
        this.asm.cmpReg(ra, rb);
    }

    cmpImm(a, imm) {
        const ra = this._getReg(a, Reg.R10);
        this.asm.cmpImm(ra, imm);
    }

    jmp(label) {
        this.asm.jmp(label);
    }

    jeq(label) {
        this.asm.je(label);
    }

    jne(label) {
        this.asm.jne(label);
    }

    jlt(label) {
        this.asm.jl(label);
    }

    jle(label) {
        this.asm.jle(label);
    }

    jgt(label) {
        this.asm.jg(label);
    }

    jge(label) {
        this.asm.jge(label);
    }

    // 无符号比较跳转
    jb(label) {
        this.asm.jb(label);
    }

    jbe(label) {
        this.asm.jbe(label);
    }

    ja(label) {
        this.asm.ja(label);
    }

    jae(label) {
        this.asm.jae(label);
    }

    // ========== 函数调用 ==========

    prologue(stackSize, savedRegs) {
        // 保存 RBP
        this.asm.push(Reg.RBP);
        this.asm.movReg(Reg.RBP, Reg.RSP);

        // 过滤 S5（它使用栈槽位，不是 push/pop）
        const regsWithoutS5 = savedRegs.filter((r) => !this.isS5(r));
        const hasS5 = savedRegs.some((r) => this.isS5(r));

        // 保存 callee-saved 寄存器
        for (const vreg of regsWithoutS5) {
            this.asm.push(this.mapReg(vreg));
        }

        // 计算栈空间：原始 stackSize + S5 槽位（如果需要）
        let totalStack = stackSize;
        if (hasS5) {
            totalStack += 8; // S5 槽位
        }

        // 分配栈空间（16 字节对齐）
        const aligned = totalStack > 0 ? Math.ceil(totalStack / 16) * 16 : 0;
        if (aligned > 0) {
            this.asm.subImm(Reg.RSP, aligned);
        }

        // S5 槽位在分配的栈空间的最高地址处（紧贴 pushed regs 下方）
        // 栈布局：
        //   [RBP + 8]  返回地址
        //   [RBP]      old RBP
        //   [RBP - 8]  第一个 saved reg
        //   [RBP - 16] 第二个 saved reg
        //   ...
        //   [RBP - N*8] 最后一个 saved reg (N = regsWithoutS5.length)
        //   [RBP - N*8 - 8] S5 槽位 (如果 hasS5)
        //   ... 剩余栈空间 ...
        //   [RSP] 栈底
        if (hasS5) {
            const savedRegBytes = regsWithoutS5.length * 8;
            this.s5StackOffset = -(savedRegBytes + 8);
        }
    }

    epilogue(savedRegs, stackSize) {
        // 过滤 S5（它使用栈槽位，不是 push/pop）
        const regsWithoutS5 = savedRegs.filter((r) => !this.isS5(r));
        const hasS5 = savedRegs.some((r) => this.isS5(r));

        // 计算总栈空间
        let totalStack = stackSize;
        if (hasS5) {
            totalStack += 8; // S5 槽位
        }
        const aligned = totalStack > 0 ? Math.ceil(totalStack / 16) * 16 : 0;

        // 恢复栈空间（使 RSP 指向 saved regs）
        if (aligned > 0) {
            this.asm.addImm(Reg.RSP, aligned);
        }

        // 恢复 callee-saved 寄存器（反序 pop）
        for (let i = regsWithoutS5.length - 1; i >= 0; i--) {
            this.asm.pop(this.mapReg(regsWithoutS5[i]));
        }

        // 恢复 RBP 并返回
        this.asm.pop(Reg.RBP);
        this.asm.ret();
    }

    call(label) {
        this.asm.call(label);
    }

    callIndirect(reg) {
        // CALL reg - 间接调用
        const r = this._getReg(reg, Reg.R10);
        this.asm.callReg(r);
    }

    jmpIndirect(reg) {
        // JMP reg - 间接跳转 (不保存返回地址)
        const r = this._getReg(reg, Reg.R10);
        this.asm.jmpReg(r);
    }

    ret() {
        this.asm.ret();
    }

    prepareCall(args) {
        // 将参数放入寄存器
        for (let i = 0; i < args.length && i < this.callRegs.length; i++) {
            const arg = args[i];
            const targetReg = this.callRegs[i];
            if (typeof arg === "number") {
                this.asm.movImm(targetReg, arg);
            } else {
                const srcReg = this._getReg(arg, Reg.R10);
                if (srcReg !== targetReg) {
                    this.asm.movReg(targetReg, srcReg);
                }
            }
        }
    }

    // ========== 栈操作 ==========

    push(reg) {
        const r = this._getReg(reg, Reg.R10);
        this.asm.push(r);
    }

    pop(reg) {
        if (this.isS5(reg)) {
            this.asm.pop(Reg.R10);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.R10);
        } else {
            this.asm.pop(this.mapReg(reg));
        }
    }

    // ========== 系统调用 ==========

    syscall(num) {
        // macOS/Linux x64 syscall 约定:
        // 参数: rdi, rsi, rdx, r10, r8, r9 (注意第 4 个是 r10，不是 rcx)
        // syscall 指令会破坏 rcx 和 r11
        // 我们的 A3 映射到 rcx，需要复制到 r10
        this.asm.movReg(Reg.R10, Reg.RCX);
        this.asm.movImm(Reg.RAX, num);
        this.asm.syscall();
    }

    // Windows API 调用
    // slotIndex: IAT 槽索引 (0=VirtualAlloc, 1=GetStdHandle, 2=WriteConsoleA, 3=ExitProcess)
    callWindowsAPI(slotIndex) {
        // Windows x64 调用约定:
        // 参数: rcx, rdx, r8, r9 (前 4 个)
        // 返回值: rax
        // 需要 32 字节 shadow space
        // 调用者需要 16 字节栈对齐

        // 在 Windows 模式下，我们的 VReg 映射已经是 Windows ABI:
        // A0 -> RCX, A1 -> RDX, A2 -> R8, A3 -> R9
        // 所以不需要重新映射参数！

        // 分配 shadow space (32 字节) + 栈对齐
        this.asm.subImm(Reg.RSP, 40); // 32 shadow + 8 对齐

        // 通过 IAT 调用
        // 假设 IAT 基址在某个位置，这里使用 RIP 相对寻址
        // call qword ptr [rip + iat_offset]
        // 需要生成: FF 15 xx xx xx xx (call [rip+disp32])
        this.asm.callIAT(slotIndex);

        // 恢复栈
        this.asm.addImm(Reg.RSP, 40);
    }

    // Windows WriteConsoleA 调用
    // 输入: A1=buffer, A2=length
    // IAT 槽: 1=GetStdHandle, 2=WriteConsoleA
    callWindowsWriteConsole() {
        // 保存 callee-saved 寄存器
        this.asm.push(Reg.RBX);
        this.asm.push(Reg.R12);
        this.asm.push(Reg.R13);

        // Windows ABI: A1=RDX=buffer, A2=R8=length
        this.asm.movReg(Reg.R12, Reg.RDX); // buffer (A1 -> RDX in Windows ABI)
        this.asm.movReg(Reg.R13, Reg.R8); // length (A2 -> R8 in Windows ABI)

        // 分配栈空间: 32 shadow + 8 lpWritten + 8 5th param + 48 for XMM0-XMM5 + 对齐
        // 总共 104 字节，但需要 16 字节对齐
        // 当前: 3 个 push 后栈偏移了 24 字节
        // 104 + 24 = 128，128 % 16 = 0，对齐OK
        // 但 56 + 48 = 104，不是 8 的倍数...让我们用 112 (56 + 56 for 7 XMM slots)
        this.asm.subImm(Reg.RSP, 104);

        // 保存 XMM0-XMM5 到栈上 (偏移从 56 开始，在 shadow space 和 lpWritten 之后)
        this.asm.movsdToStack(56, 0); // XMM0
        this.asm.movsdToStack(64, 1); // XMM1
        this.asm.movsdToStack(72, 2); // XMM2
        this.asm.movsdToStack(80, 3); // XMM3
        this.asm.movsdToStack(88, 4); // XMM4
        this.asm.movsdToStack(96, 5); // XMM5

        // GetStdHandle(STD_OUTPUT_HANDLE = -11)
        this.asm.movImm(Reg.RCX, -11);
        this.asm.callRipRel("__imp_GetStdHandle_1");

        // RAX = stdout handle，保存到 RBX
        this.asm.movReg(Reg.RBX, Reg.RAX);

        // WriteConsoleA(hConsoleOutput, lpBuffer, nNumberOfCharsToWrite, lpNumberOfCharsWritten, lpReserved)
        this.asm.movReg(Reg.RCX, Reg.RBX); // hConsoleOutput
        this.asm.movReg(Reg.RDX, Reg.R12); // lpBuffer
        this.asm.movReg(Reg.R8, Reg.R13); // nNumberOfCharsToWrite
        this.asm.leaReg(Reg.R9, Reg.RSP, 40); // lpNumberOfCharsWritten (栈上)
        // lpReserved = NULL (第 5 个参数在 RSP+32)
        this.asm.movImm(Reg.RAX, 0);
        this.asm.movStoreOffset(Reg.RSP, 32, Reg.RAX);
        this.asm.callRipRel("__imp_WriteConsoleA_2");

        // 恢复 XMM0-XMM5
        this.asm.movsdFromStack(0, 56); // XMM0
        this.asm.movsdFromStack(1, 64); // XMM1
        this.asm.movsdFromStack(2, 72); // XMM2
        this.asm.movsdFromStack(3, 80); // XMM3
        this.asm.movsdFromStack(4, 88); // XMM4
        this.asm.movsdFromStack(5, 96); // XMM5

        // 恢复栈
        this.asm.addImm(Reg.RSP, 104);
        this.asm.pop(Reg.R13);
        this.asm.pop(Reg.R12);
        this.asm.pop(Reg.RBX);
    }

    // Windows ExitProcess 调用
    // 输入: A0=exit_code (RCX in Windows ABI)
    // IAT 槽: 3=ExitProcess
    callWindowsExitProcess() {
        // Windows ABI: A0 -> RCX
        // 分配 shadow space
        this.asm.subImm(Reg.RSP, 40);
        this.asm.callRipRel("__imp_ExitProcess_3");
        // ExitProcess 不会返回，但为了代码完整性
        this.asm.addImm(Reg.RSP, 40);
    }

    // 通用 IAT 调用方法
    // funcName: Windows API 函数名或槽位索引
    callIAT(funcNameOrSlot) {
        // Windows API 名称到槽位的映射
        const slotMap = {
            VirtualAlloc: 0,
            GetStdHandle: 1,
            WriteConsoleA: 2,
            ExitProcess: 3,
            GetSystemTimeAsFileTime: 4,
        };

        let slotIndex;
        if (typeof funcNameOrSlot === "string") {
            slotIndex = slotMap[funcNameOrSlot];
            if (slotIndex === undefined) {
                throw new Error(`Unknown Windows API: ${funcNameOrSlot}`);
            }
        } else {
            slotIndex = funcNameOrSlot;
        }

        // Windows x64 调用约定:
        // 参数: rcx, rdx, r8, r9 (前 4 个)
        // 返回值: rax
        // 需要 32 字节 shadow space

        // 参数重映射 (System V -> Windows)
        // A0(RDI) -> RCX, A1(RSI) -> RDX, A2(RDX) -> R8, A3(RCX) -> R9
        this.asm.movReg(Reg.R10, Reg.RDI); // 保存 A0
        this.asm.movReg(Reg.R11, Reg.RSI); // 保存 A1
        this.asm.movReg(Reg.RCX, Reg.R10); // 第1参数: A0 -> RCX
        this.asm.movReg(Reg.R8, Reg.RDX); // 第3参数: A2 -> R8
        this.asm.movReg(Reg.RDX, Reg.R11); // 第2参数: A1 -> RDX

        // 分配 shadow space (32 字节) + 对齐
        this.asm.subImm(Reg.RSP, 40);

        // 通过 IAT 调用
        this.asm.callIAT(slotIndex);

        // 恢复栈
        this.asm.addImm(Reg.RSP, 40);
    }

    // ========== 类型转换 ==========

    // Float to Int: 从 Number 对象中提取整数值
    // src 是指向 Number 对象的指针，dest 接收整数值
    f2i(dest, src) {
        const rd = this.mapReg(dest);
        const rs = this._getReg(src, Reg.R10);
        // Number 对象: offset 0 = type, offset 8 = float64 bits
        // 加载 float64 位模式到 R11
        this.asm.movLoadOffset(Reg.R11, rs, 8);
        // 将位模式移到 XMM0
        this.asm.movqToXmm(0, Reg.R11);
        // 转换为整数 (cvttsd2si)
        this.asm.cvttsd2si(rd, 0);
    }

    // ========== 浮点运算 (VM 抽象接口实现) ==========

    // 将整数寄存器的位模式移动到 XMM 浮点寄存器
    fmovToFloat(fpReg, gpReg) {
        const gp = this._getReg(gpReg, Reg.R10);
        this.asm.movqToXmm(fpReg, gp);
    }

    // 将 XMM 浮点寄存器的位模式移动到整数寄存器
    fmovToInt(gpReg, fpReg) {
        if (this.isS5(gpReg)) {
            this.asm.movqFromXmm(Reg.R10, fpReg);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.R10);
        } else {
            this.asm.movqFromXmm(this.mapReg(gpReg), fpReg);
        }
    }

    // 浮点加法
    fadd(fpDest, fpA, fpB) {
        // x64 SSE: addsd 是 dest = dest + src
        if (fpDest !== fpA) {
            this.asm.movsd(fpDest, fpA);
        }
        this.asm.addsd(fpDest, fpB);
    }

    // 浮点减法
    fsub(fpDest, fpA, fpB) {
        if (fpDest !== fpA) {
            this.asm.movsd(fpDest, fpA);
        }
        this.asm.subsd(fpDest, fpB);
    }

    // 浮点乘法
    fmul(fpDest, fpA, fpB) {
        if (fpDest !== fpA) {
            this.asm.movsd(fpDest, fpA);
        }
        this.asm.mulsd(fpDest, fpB);
    }

    // 浮点除法
    fdiv(fpDest, fpA, fpB) {
        if (fpDest !== fpA) {
            this.asm.movsd(fpDest, fpA);
        }
        this.asm.divsd(fpDest, fpB);
    }

    // 浮点转整数 (截断)
    fcvtzs(gpDest, fpSrc) {
        if (this.isS5(gpDest)) {
            this.asm.cvttsd2si(Reg.R10, fpSrc);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.R10);
        } else {
            this.asm.cvttsd2si(this.mapReg(gpDest), fpSrc);
        }
    }

    // 浮点取模: fpDest = fpA % fpB
    fmod(fpDest, fpA, fpB) {
        // 浮点取模: a % b = a - trunc(a / b) * b
        // 使用 XMM7 作为临时寄存器
        this.asm.movsd(7, fpA); // XMM7 = a
        this.asm.divsd(7, fpB); // XMM7 = a / b
        this.asm.roundsd(7, 7, 3); // XMM7 = trunc(XMM7), mode 3 = toward zero
        this.asm.mulsd(7, fpB); // XMM7 = XMM7 * b
        if (fpDest !== fpA) {
            this.asm.movsd(fpDest, fpA);
        }
        this.asm.subsd(fpDest, 7); // fpDest = a - XMM7
    }

    // 浮点与零比较
    fcmpZero(fpReg) {
        // 清零 XMM7 并比较
        this.asm.xorpd(7, 7);
        this.asm.ucomisd(fpReg, 7);
    }

    // 浮点绝对值
    fabs(fpDest, fpSrc) {
        // 使用掩码清除符号位: AND with 0x7FFFFFFFFFFFFFFF
        if (fpDest !== fpSrc) {
            this.asm.movsd(fpDest, fpSrc);
        }
        // 构建掩码到 XMM7
        this.asm.movImm(Reg.RAX, 0x7fffffff);
        this.asm.shlImm(Reg.RAX, 32);
        this.asm.movImm(Reg.RCX, 0xffffffff);
        this.asm.orReg(Reg.RAX, Reg.RCX);
        this.asm.movqToXmm(7, Reg.RAX);
        this.asm.andpd(fpDest, 7);
    }

    // 浮点截断
    ftrunc(fpDest, fpSrc) {
        this.asm.roundsd(fpDest, fpSrc, 3); // mode 3 = toward zero
    }

    // 整数转浮点: fpDest = (double)gpSrc
    scvtf(fpDest, gpSrc) {
        const gp = this._getReg(gpSrc, Reg.R10);
        this.asm.cvtsi2sd(fpDest, gp);
    }

    // 双精度转单精度
    fcvtd2s(fpDest, fpSrc) {
        this.asm.cvtsd2ss(fpDest, fpSrc);
    }

    // 单精度转双精度
    fcvts2d(fpDest, fpSrc) {
        this.asm.cvtss2sd(fpDest, fpSrc);
    }

    // 将单精度浮点寄存器的位模式移到整数寄存器 (32位)
    fmovToIntSingle(gpDest, fpSrc) {
        if (this.isS5(gpDest)) {
            this.asm.movdFromXmm(Reg.R10, fpSrc);
            this.asm.movStoreOffset(Reg.RBP, this.s5StackOffset, Reg.R10);
        } else {
            this.asm.movdFromXmm(this.mapReg(gpDest), fpSrc);
        }
    }

    // 将单精度整数位模式移到浮点寄存器
    fmovToFloatSingle(fpDest, gpSrc) {
        const gp = this._getReg(gpSrc, Reg.R10);
        this.asm.movdToXmm(fpDest, gp);
    }

    // 浮点比较
    fcmp(fpA, fpB) {
        this.asm.ucomisd(fpA, fpB);
    }

    // 浮点寄存器间移动
    fmov(fpDest, fpSrc) {
        this.asm.movsd(fpDest, fpSrc);
    }
}
