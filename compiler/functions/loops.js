// JSBin 编译器 - 循环与条件语句编译

import { VReg } from "../../vm/index.js";
import { Type, inferType } from "../core/types.js";

export const LoopCompiler = {
    // 编译条件测试并跳转到 falseLabel（如果条件为假）
    // 对布尔类型直接比较，其他类型调用 _to_boolean
    compileConditionTest(testExpr, falseLabel) {
        this.compileExpression(testExpr);
        const testType = inferType(testExpr, this.ctx);

        if (testType === Type.BOOLEAN) {
            // 已经是布尔值，直接与 _js_false 比较
            this.vm.lea(VReg.V1, "_js_false");
            this.vm.load(VReg.V1, VReg.V1, 0);
            this.vm.cmp(VReg.RET, VReg.V1);
            this.vm.jeq(falseLabel);
        } else {
            // 其他类型需要调用 _to_boolean
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_to_boolean");
            this.vm.cmpImm(VReg.RET, 0);
            this.vm.jeq(falseLabel);
        }
    },

    // 编译 if 语句
    compileIfStatement(stmt) {
        const elseLabel = this.ctx.newLabel("else");
        const endLabel = this.ctx.newLabel("endif");

        this.compileConditionTest(stmt.test, stmt.alternate ? elseLabel : endLabel);

        this.compileStatement(stmt.consequent);

        if (stmt.alternate) {
            this.vm.jmp(endLabel);
            this.vm.label(elseLabel);
            this.compileStatement(stmt.alternate);
        }

        this.vm.label(endLabel);
    },

    // 编译 while 语句
    compileWhileStatement(stmt) {
        const loopLabel = this.ctx.newLabel("while");
        const endLabel = this.ctx.newLabel("endwhile");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = loopLabel;

        this.vm.label(loopLabel);
        this.compileConditionTest(stmt.test, endLabel);

        this.compileStatement(stmt.body);
        this.vm.jmp(loopLabel);

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 for 语句
    compileForStatement(stmt) {
        const loopLabel = this.ctx.newLabel("for");
        const updateLabel = this.ctx.newLabel("for_update");
        const endLabel = this.ctx.newLabel("endfor");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = updateLabel;

        if (stmt.init) {
            if (stmt.init.type === "VariableDeclaration") {
                this.compileVariableDeclaration(stmt.init);
            } else {
                this.compileExpression(stmt.init);
            }
        }

        this.vm.label(loopLabel);

        if (stmt.test) {
            this.compileConditionTest(stmt.test, endLabel);
        }

        this.compileStatement(stmt.body);

        this.vm.label(updateLabel);
        if (stmt.update) {
            this.compileExpression(stmt.update);
        }

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 for...of 语句
    compileForOfStatement(stmt) {
        const loopLabel = this.ctx.newLabel("forof");
        const endLabel = this.ctx.newLabel("endforof");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = loopLabel;

        // 计算数组，保存到 S0
        this.compileExpression(stmt.right);
        this.vm.mov(VReg.S0, VReg.RET);

        // 索引变量 i = 0，保存到 S1
        this.vm.movImm(VReg.S1, 0);

        // 获取数组长度，保存到 S2
        this.vm.load(VReg.S2, VReg.S0, 0);

        // 获取迭代变量名
        let varName = null;
        if (stmt.left.type === "VariableDeclaration" && stmt.left.declarations.length > 0) {
            const decl = stmt.left.declarations[0];
            if (decl.id.type === "Identifier") {
                varName = decl.id.name;
            }
        } else if (stmt.left.type === "Identifier") {
            varName = stmt.left.name;
        }

        // 分配迭代变量
        const varOffset = varName ? this.ctx.allocLocal(varName) : null;

        this.vm.label(loopLabel);

        // 检查 i < length
        this.vm.cmp(VReg.S1, VReg.S2);
        this.vm.jge(endLabel);

        // 获取 array[i]
        this.vm.mov(VReg.V0, VReg.S1);
        this.vm.shlImm(VReg.V0, VReg.V0, 3);
        this.vm.addImm(VReg.V0, VReg.V0, 8);
        this.vm.add(VReg.V0, VReg.S0, VReg.V0);
        this.vm.load(VReg.RET, VReg.V0, 0);

        // 存储到迭代变量
        if (varOffset !== null) {
            this.vm.store(VReg.FP, varOffset, VReg.RET);
        }

        // 编译循环体
        this.compileStatement(stmt.body);

        // i++
        this.vm.addImm(VReg.S1, VReg.S1, 1);
        this.vm.jmp(loopLabel);

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 for...in 语句
    compileForInStatement(stmt) {
        const loopLabel = this.ctx.newLabel("forin");
        const endLabel = this.ctx.newLabel("endforin");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = loopLabel;

        // 计算对象/数组，保存到 S0
        this.compileExpression(stmt.right);
        this.vm.mov(VReg.S0, VReg.RET);

        // 索引变量 i = 0，保存到 S1
        this.vm.movImm(VReg.S1, 0);

        // 获取长度，保存到 S2
        this.vm.load(VReg.S2, VReg.S0, 0);

        // 获取迭代变量名
        let varName = null;
        if (stmt.left.type === "VariableDeclaration" && stmt.left.declarations.length > 0) {
            const decl = stmt.left.declarations[0];
            if (decl.id.type === "Identifier") {
                varName = decl.id.name;
            }
        } else if (stmt.left.type === "Identifier") {
            varName = stmt.left.name;
        }

        // 分配迭代变量
        const varOffset = varName ? this.ctx.allocLocal(varName) : null;

        this.vm.label(loopLabel);

        // 检查 i < length
        this.vm.cmp(VReg.S1, VReg.S2);
        this.vm.jge(endLabel);

        // for...in 返回索引
        this.vm.mov(VReg.RET, VReg.S1);

        // 存储到迭代变量
        if (varOffset !== null) {
            this.vm.store(VReg.FP, varOffset, VReg.RET);
        }

        // 编译循环体
        this.compileStatement(stmt.body);

        // i++
        this.vm.addImm(VReg.S1, VReg.S1, 1);
        this.vm.jmp(loopLabel);

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 do-while 语句
    compileDoWhileStatement(stmt) {
        const loopLabel = this.ctx.newLabel("dowhile");
        const testLabel = this.ctx.newLabel("dowhile_test");
        const endLabel = this.ctx.newLabel("enddowhile");

        // 保存循环标签
        const savedBreak = this.ctx.breakLabel;
        const savedContinue = this.ctx.continueLabel;
        this.ctx.breakLabel = endLabel;
        this.ctx.continueLabel = testLabel;

        this.vm.label(loopLabel);
        this.compileStatement(stmt.body);

        // 条件检查
        this.vm.label(testLabel);
        this.compileExpression(stmt.test);
        const testType = inferType(stmt.test, this.ctx);

        if (testType === Type.BOOLEAN) {
            // 已经是布尔值，与 _js_true 比较，相等则继续循环
            this.vm.lea(VReg.V1, "_js_true");
            this.vm.load(VReg.V1, VReg.V1, 0);
            this.vm.cmp(VReg.RET, VReg.V1);
            this.vm.jeq(loopLabel);
        } else {
            // 其他类型需要调用 _to_boolean
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_to_boolean");
            this.vm.cmpImm(VReg.RET, 1);
            this.vm.jeq(loopLabel);
        }

        this.vm.label(endLabel);

        // 恢复循环标签
        this.ctx.breakLabel = savedBreak;
        this.ctx.continueLabel = savedContinue;
    },

    // 编译 break 语句
    compileBreakStatement(stmt) {
        if (this.ctx.breakLabel) {
            this.vm.jmp(this.ctx.breakLabel);
        }
    },

    // 编译 continue 语句
    compileContinueStatement(stmt) {
        if (this.ctx.continueLabel) {
            this.vm.jmp(this.ctx.continueLabel);
        }
    },
};
