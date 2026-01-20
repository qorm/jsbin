// JSBin 编译器 - 运算符编译
// 编译二元运算、一元运算、逻辑运算等

import { VReg } from "../../vm/index.js";
import { Type, inferType, isIntType } from "../core/types.js";

const TYPE_FLOAT64 = 29;

// 运算符编译方法混入
export const OperatorCompiler = {
    // 从 Number 对象中解包数值到寄存器
    // 输入: reg 包含 Number 对象指针
    // 输出: reg 包含 float64 位模式
    // 注：TYPE_NUMBER 和 TYPE_FLOAT64 的 offset 8 都是 float64 位模式
    unboxNumber(reg) {
        this.vm.load(reg, reg, 8); // 从 +8 偏移加载 float64 位模式
    },

    // 将 float64 位模式包装成 Number 对象
    // 输入: valueReg 包含 float64 位模式
    // 输出: RET 包含 Number 对象指针
    boxNumber(valueReg) {
        // 保存值到 S0（因为 _alloc 会改变 caller-saved 寄存器）
        this.vm.mov(VReg.S0, valueReg);

        // 分配 16 字节
        this.vm.movImm(VReg.A0, 16);
        this.vm.call("_alloc");
        // RET (X0) 现在是分配的地址，保存到 S1
        this.vm.mov(VReg.S1, VReg.RET);

        // 写入类型标记（使用 V1 避免覆盖 RET/X0）
        this.vm.movImm(VReg.V1, TYPE_FLOAT64);
        this.vm.store(VReg.S1, 0, VReg.V1);

        // 写入值
        this.vm.store(VReg.S1, 8, VReg.S0);

        // 将结果移回 RET
        this.vm.mov(VReg.RET, VReg.S1);
    },

    // 将 int64（寄存器中的整数值）按 JS Number 语义装箱成 Number 对象
    // 输入: intReg 包含 int64 整数值
    // 输出: RET 包含 Number 对象指针
    // 说明：内部会覆盖 intReg 的值
    boxIntAsNumber(intReg) {
        this.vm.scvtf(0, intReg);
        this.vm.fmovToInt(intReg, 0);
        this.boxNumber(intReg);
    },

    // 将 int64（寄存器中的整数值）转换为 float64 位模式（不装箱）
    // 输入: intReg 包含 int64 整数值
    // 输出: intReg 变为 float64 位模式（仍在整数寄存器里）
    // 用途：算术运算前把整数字面量转换成浮点位模式
    intToFloat64Bits(intReg) {
        this.vm.scvtf(0, intReg);
        this.vm.fmovToInt(intReg, 0);
    },

    // 将浮点寄存器 fpIndex 中的结果按 JS Number 语义装箱成 Number 对象
    // 输入: fpIndex (0/1/...) 指定 FP 寄存器
    // 输出: RET 为 Number 对象指针
    boxFPAsNumber(fpIndex = 0) {
        this.vm.fmovToInt(VReg.RET, fpIndex);
        this.boxNumber(VReg.RET);
    },

    // 将 Number 对象转换为整数（用于数组下标等）
    // 输入: srcReg 为 Number 对象指针
    // 输出: destReg 为 int64 整数值
    numberToInt(destReg, srcReg) {
        this.vm.f2i(destReg, srcReg);
    },

    // in-place 版本：直接把 reg 的 Number 对象转换为 int64
    numberToIntInPlace(reg) {
        this.vm.f2i(reg, reg);
    },

    // 检测表达式是否为整数类型
    isIntExpression(expr) {
        const type = inferType(expr, this.ctx);
        return isIntType(type);
    },

    // 编译表达式作为整数（用于 int 类型上下文）
    compileExpressionAsInt(expr) {
        // 对于整数字面量，直接使用整数值
        if ((expr.type === "Literal" || expr.type === "NumericLiteral") && typeof expr.value === "number") {
            this.compileIntLiteral(expr.value);
            return;
        }
        // 对于二元表达式，递归处理
        if (expr.type === "BinaryExpression") {
            const op = expr.operator;
            if (["+", "-", "*", "/", "%"].includes(op)) {
                this.compileExpressionAsInt(expr.right);
                this.vm.push(VReg.RET);
                this.compileExpressionAsInt(expr.left);
                this.vm.pop(VReg.V1);

                switch (op) {
                    case "+":
                        this.vm.add(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "-":
                        this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "*":
                        this.vm.mul(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "/":
                        this.vm.div(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "%":
                        this.vm.mod(VReg.RET, VReg.RET, VReg.V1);
                        break;
                }
                return;
            }
        }
        // 其他情况正常编译
        this.compileExpression(expr);
    },

    // 编译二元表达式
    compileBinaryExpression(expr) {
        const op = expr.operator;

        // 常量折叠：两个字面量运算在编译时计算
        const leftLit = expr.left.type === "Literal" || expr.left.type === "NumericLiteral";
        const rightLit = expr.right.type === "Literal" || expr.right.type === "NumericLiteral";
        if (leftLit && rightLit && typeof expr.left.value === "number" && typeof expr.right.value === "number") {
            let result;
            const a = expr.left.value;
            const b = expr.right.value;
            switch (op) {
                case "+":
                    result = a + b;
                    break;
                case "-":
                    result = a - b;
                    break;
                case "*":
                    result = a * b;
                    break;
                case "/":
                    result = a / b;
                    break;
                case "%":
                    result = a % b;
                    break;
                case "<":
                    result = a < b;
                    break;
                case "<=":
                    result = a <= b;
                    break;
                case ">":
                    result = a > b;
                    break;
                case ">=":
                    result = a >= b;
                    break;
                case "==":
                    result = a == b;
                    break;
                case "===":
                    result = a === b;
                    break;
                case "!=":
                    result = a != b;
                    break;
                case "!==":
                    result = a !== b;
                    break;
                default:
                    result = null;
            }
            if (result !== null) {
                if (typeof result === "boolean") {
                    this.vm.movImm(VReg.RET, result ? 1 : 0);
                } else {
                    this.compileNumericLiteral(result);
                }
                return;
            }
        }

        // 字符串连接处理
        if (op === "+") {
            const leftType = inferType(expr.left, this.ctx);
            const rightType = inferType(expr.right, this.ctx);
            if (leftType === Type.STRING || rightType === Type.STRING) {
                this.compileStringConcat(expr);
                return;
            }
        }

        // 检测是否为 int 类型运算
        const isIntOp = this.isIntExpression(expr.left) && this.isIntExpression(expr.right);

        // 对于 +, -, *, / 运算，根据类型选择浮点或整数运算
        const isArithOp = ["+", "-", "*", "/"].includes(op);

        if (isIntOp) {
            // int 类型：使用整数运算
            this.compileExpressionAsInt(expr.right);
            this.vm.push(VReg.RET);
            this.compileExpressionAsInt(expr.left);
            this.vm.pop(VReg.V1);

            switch (op) {
                case "+":
                    this.vm.add(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "-":
                    this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "*":
                    this.vm.mul(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "/":
                    this.vm.div(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "%":
                    this.vm.mod(VReg.RET, VReg.RET, VReg.V1);
                    return;
                // 比较运算也用整数比较
                case "<":
                    this.compileComparison("jlt");
                    return;
                case "<=":
                    this.compileComparison("jle");
                    return;
                case ">":
                    this.compileComparison("jgt");
                    return;
                case ">=":
                    this.compileComparison("jge");
                    return;
                case "==":
                case "===":
                    this.compileComparison("jeq");
                    return;
                case "!=":
                case "!==":
                    this.compileComparison("jne");
                    return;
            }
        }

        // 辅助函数：编译操作数为 float64 位模式
        // 由于变量类型可能在运行时改变（如整数变量被赋值为 Number 对象），
        // 我们需要更保守的策略
        const compileOperandAsFloat = (operand) => {
            const opType = inferType(operand, this.ctx);

            // 对于字面量，可以安全地使用静态类型
            if (operand.type === "Literal" || operand.type === "NumericLiteral") {
                if (isIntType(opType)) {
                    // 整数字面量：直接转换为 float64 位模式
                    this.compileExpressionAsInt(operand);
                    this.intToFloat64Bits(VReg.RET);
                    return;
                }
            }

            // 对于变量和其他表达式，假设可能是 Number 对象
            // 编译后 unbox（unbox 假设值是 Number 对象指针）
            this.compileExpression(operand);
            this.unboxNumber(VReg.RET);
        };

        // 先计算右操作数，保存到栈
        compileOperandAsFloat(expr.right);
        this.vm.push(VReg.RET);

        // 计算左操作数
        compileOperandAsFloat(expr.left);
        this.vm.pop(VReg.V1);

        // 对于算术运算，使用浮点指令
        if (isArithOp) {
            // 使用 VM 的统一浮点接口，不再区分 arm64/x64
            this.vm.fmovToFloat(0, VReg.RET); // FP0 = left
            this.vm.fmovToFloat(1, VReg.V1); // FP1 = right

            switch (op) {
                case "+":
                    this.vm.fadd(0, 0, 1);
                    break;
                case "-":
                    this.vm.fsub(0, 0, 1);
                    break;
                case "*":
                    this.vm.fmul(0, 0, 1);
                    break;
                case "/":
                    this.vm.fdiv(0, 0, 1);
                    break;
            }

            // 将结果包装为 Number 对象
            this.boxFPAsNumber(0);
            return;
        }

        // 位运算等使用整数运算
        switch (expr.operator) {
            case "+":
                this.vm.add(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "-":
                this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "*":
                this.vm.mul(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "/":
                this.vm.div(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "%":
                // 浮点取模: a % b = a - trunc(a / b) * b
                if (!isIntOp) {
                    // 使用 VM 的统一接口
                    this.vm.fmovToFloat(0, VReg.RET); // FP0 = left
                    this.vm.fmovToFloat(1, VReg.V1); // FP1 = right
                    this.vm.fmod(0, 0, 1); // FP0 = FP0 % FP1
                    this.boxFPAsNumber(0);
                    break;
                }
                this.vm.mod(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "&":
                this.vm.and(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "|":
                this.vm.or(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "^":
                this.vm.xor(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "<<":
                this.vm.shl(VReg.RET, VReg.RET, VReg.V1);
                break;
            case ">>":
                this.vm.shr(VReg.RET, VReg.RET, VReg.V1);
                break;
            case ">>>":
                this.vm.shr(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "<":
                this.compileComparison("jlt");
                break;
            case "<=":
                this.compileComparison("jle");
                break;
            case ">":
                this.compileComparison("jgt");
                break;
            case ">=":
                this.compileComparison("jge");
                break;
            case "==":
            case "===":
                this.compileComparison("jeq");
                break;
            case "!=":
            case "!==":
                this.compileComparison("jne");
                break;
            case "instanceof":
                // 左操作数在 RET，右操作数在 V1
                // 调用 _instanceof 运行时函数
                this.vm.mov(VReg.A0, VReg.RET); // 左操作数（实例）
                this.vm.mov(VReg.A1, VReg.V1); // 右操作数（构造函数）
                this.vm.call("_instanceof");
                break;
            case "in":
                // 检查属性是否在对象中: "prop" in obj
                // 左操作数在 RET（属性名），右操作数在 V1（对象）
                // _prop_in 参数顺序: (obj, key) 并检查原型链
                this.vm.mov(VReg.A0, VReg.V1); // 对象
                this.vm.mov(VReg.A1, VReg.RET); // 属性名
                this.vm.call("_prop_in");
                break;
            default:
                console.warn("Unhandled binary operator:", expr.operator);
        }
    },

    // 编译比较运算
    compileComparison(jumpOp) {
        const trueLabel = this.ctx.newLabel("cmp_true");
        const endLabel = this.ctx.newLabel("cmp_end");

        this.vm.cmp(VReg.RET, VReg.V1);
        this.vm[jumpOp](trueLabel);
        this.vm.movImm(VReg.RET, 0);
        this.vm.jmp(endLabel);
        this.vm.label(trueLabel);
        this.vm.movImm(VReg.RET, 1);
        this.vm.label(endLabel);
    },

    // 编译逻辑表达式 (&&, ||)
    compileLogicalExpression(expr) {
        const endLabel = this.ctx.newLabel("logical_end");

        this.compileExpression(expr.left);

        if (expr.operator === "&&") {
            this.vm.cmpImm(VReg.RET, 0);
            this.vm.jeq(endLabel);
            this.compileExpression(expr.right);
        } else if (expr.operator === "||") {
            this.vm.cmpImm(VReg.RET, 0);
            this.vm.jne(endLabel);
            this.compileExpression(expr.right);
        }

        this.vm.label(endLabel);
    },

    // 编译一元表达式
    compileUnaryExpression(expr) {
        // 常量折叠：如果是负号操作符且参数是数字字面量，直接编译负值
        if (expr.operator === "-" && expr.argument.type === "Literal" && typeof expr.argument.value === "number") {
            const negValue = -expr.argument.value;
            this.compileNumericLiteral(negValue);
            return;
        }

        this.compileExpression(expr.argument);

        switch (expr.operator) {
            case "-":
                this.vm.mov(VReg.V1, VReg.RET);
                this.vm.movImm(VReg.RET, 0);
                this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "!":
                const trueLabel = this.ctx.newLabel("not_true");
                const endLabel = this.ctx.newLabel("not_end");
                this.vm.cmpImm(VReg.RET, 0);
                this.vm.jeq(trueLabel);
                this.vm.movImm(VReg.RET, 0);
                this.vm.jmp(endLabel);
                this.vm.label(trueLabel);
                this.vm.movImm(VReg.RET, 1);
                this.vm.label(endLabel);
                break;
            case "~":
                this.vm.movImm(VReg.V1, -1);
                this.vm.xor(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "+":
                break;
            case "typeof":
                // 调用运行时函数获取类型字符串
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_typeof");
                break;
        }
    },

    // 编译条件表达式 a ? b : c
    compileConditionalExpression(expr) {
        const elseLabel = this.ctx.newLabel("cond_else");
        const endLabel = this.ctx.newLabel("cond_end");

        this.compileExpression(expr.test);
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(elseLabel);

        this.compileExpression(expr.consequent);
        this.vm.jmp(endLabel);

        this.vm.label(elseLabel);
        this.compileExpression(expr.alternate);

        this.vm.label(endLabel);
    },

    // 编译字符串连接
    compileStringConcat(expr) {
        // 编译右侧，转换为字符串
        this.compileExpressionToString(expr.right);
        this.vm.push(VReg.RET);

        // 编译左侧，转换为字符串
        this.compileExpressionToString(expr.left);

        // 调用 _strconcat(left, right)
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.pop(VReg.A1);
        this.vm.call("_strconcat");
    },

    // 编译表达式并转换为字符串
    compileExpressionToString(expr) {
        let type = inferType(expr, this.ctx);

        // 对于 MemberExpression，尝试从对象字面量推断属性类型
        if (type === Type.UNKNOWN && expr.type === "MemberExpression") {
            const propType = this.inferMemberPropertyType(expr);
            if (propType !== Type.UNKNOWN) {
                type = propType;
            }
        }

        if (type === Type.STRING) {
            // 已经是字符串
            this.compileExpression(expr);
        } else if (type === Type.INT64 || type === Type.INT32 || isIntType(type) || type === Type.FLOAT64 || type === Type.NUMBER) {
            // 数字转字符串
            // 注意：compileExpression 返回 Number 对象指针，需要从 offset 8 加载 float64 位
            this.compileExpression(expr);
            // Number 对象布局: [type:8][float64_bits:8]
            // 从 offset 8 加载 float64 位表示
            this.vm.load(VReg.V0, VReg.RET, 8);
            // 使用 VM 的统一接口: 将 float64 位表示转换为整数
            this.vm.fmovToFloat(0, VReg.V0);
            this.vm.fcvtzs(VReg.A0, 0);
            this.vm.call("_intToStr");
        } else if (type === Type.BOOLEAN) {
            // 布尔值转字符串
            this.compileExpression(expr);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_boolToStr");
        } else {
            // 默认/UNKNOWN：对象属性访问可能返回 UNKNOWN
            // 调用运行时 _valueToStr 智能检测类型
            this.compileExpression(expr);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_valueToStr");
        }
    },

    // 推断 MemberExpression 属性类型
    inferMemberPropertyType(expr) {
        // 检查对象是否是标识符（变量）
        if (expr.object.type !== "Identifier") {
            return Type.UNKNOWN;
        }

        const objName = expr.object.name;
        const propName = expr.property.name || expr.property.value;

        // 检查变量的初始化表达式
        if (this.ctx.varInitExprs && this.ctx.varInitExprs[objName]) {
            const initExpr = this.ctx.varInitExprs[objName];
            if (initExpr.type === "ObjectExpression") {
                // 在对象字面量中查找属性
                for (const prop of initExpr.properties) {
                    const key = prop.key.name || prop.key.value;
                    if (key === propName) {
                        return inferType(prop.value, this.ctx);
                    }
                }
            }
        }

        return Type.UNKNOWN;
    },
};
