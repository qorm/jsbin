// JSBin 编译器 - Math 方法编译
// 编译 Math.floor, Math.ceil, Math.abs, Math.min, Math.max 等方法

import { VReg } from "../../vm/index.js";

// Math 方法编译 Mixin
export const MathMethodCompiler = {
    // 编译 Math 方法
    compileMathMethod(methodName, args) {
        if (methodName === "floor" || methodName === "ceil" || methodName === "round") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
            }
            return true;
        }

        if (methodName === "abs") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                const negLabel = this.ctx.newLabel("abs_neg");
                const endLabel = this.ctx.newLabel("abs_end");
                this.vm.cmpImm(VReg.RET, 0);
                this.vm.jlt(negLabel);
                this.vm.jmp(endLabel);
                this.vm.label(negLabel);
                this.vm.mov(VReg.V1, VReg.RET);
                this.vm.movImm(VReg.RET, 0);
                this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                this.vm.label(endLabel);
            }
            return true;
        }

        if (methodName === "min" || methodName === "max") {
            if (args.length >= 2) {
                this.compileExpression(args[0]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[1]);
                this.vm.pop(VReg.V1);

                const useFirstLabel = this.ctx.newLabel("minmax_first");
                const endLabel = this.ctx.newLabel("minmax_end");

                this.vm.cmp(VReg.V1, VReg.RET);
                if (methodName === "min") {
                    this.vm.jlt(useFirstLabel);
                } else {
                    this.vm.jgt(useFirstLabel);
                }
                this.vm.jmp(endLabel);
                this.vm.label(useFirstLabel);
                this.vm.mov(VReg.RET, VReg.V1);
                this.vm.label(endLabel);
            }
            return true;
        }

        return false;
    },
};
