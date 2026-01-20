// JSBin 编译器 - 表达式编译（聚合模块）
// 导入并组合所有表达式相关的编译器

import { VReg } from "../../vm/index.js";
import { Type, inferType } from "../core/types.js";

// 导入拆分的模块
import { LiteralCompiler } from "./literals.js";
import { OperatorCompiler } from "./operators.js";
import { AssignmentCompiler } from "./assignments.js";
import { MemberCompiler } from "./members.js";
import { AsyncCompiler } from "../async/index.js";

// 表达式编译方法混入 - 聚合所有表达式相关的编译器
export const ExpressionCompiler = {
    // 从各模块混入方法
    ...LiteralCompiler,
    ...OperatorCompiler,
    ...AssignmentCompiler,
    ...MemberCompiler,
    ...AsyncCompiler,

    // 编译表达式（根据目标类型选择编译方式）
    compileExpressionWithType(expr, targetType) {
        // 统一使用 compileExpression，让所有数值都成为 Number 对象
        // 这确保了类型系统的一致性，避免混合整数/Number 对象的问题
        this.compileExpression(expr);
    },

    // 编译表达式
    compileExpression(expr) {
        switch (expr.type) {
            case "NumericLiteral":
                this.compileNumericLiteral(expr.value);
                break;
            case "StringLiteral":
                this.compileStringLiteral(expr);
                break;
            case "BooleanLiteral":
                this.vm.movImm(VReg.RET, expr.value ? 1 : 0);
                break;
            case "NullLiteral":
                this.vm.movImm(VReg.RET, 0);
                break;
            case "Literal":
                this.compileLiteral(expr);
                break;
            case "Identifier":
                this.compileIdentifier(expr);
                break;
            case "BinaryExpression":
                this.compileBinaryExpression(expr);
                break;
            case "LogicalExpression":
                this.compileLogicalExpression(expr);
                break;
            case "UnaryExpression":
                this.compileUnaryExpression(expr);
                break;
            case "AssignmentExpression":
                this.compileAssignmentExpression(expr);
                break;
            case "CallExpression":
                this.compileCallExpression(expr);
                break;
            case "UpdateExpression":
                this.compileUpdateExpression(expr);
                break;
            case "MemberExpression":
                this.compileMemberExpression(expr);
                break;
            case "ArrayExpression":
                this.compileArrayExpression(expr);
                break;
            case "ObjectExpression":
                this.compileObjectExpression(expr);
                break;
            case "ConditionalExpression":
                this.compileConditionalExpression(expr);
                break;
            case "FunctionExpression":
            case "ArrowFunctionExpression":
                this.compileFunctionExpression(expr);
                break;
            case "TemplateLiteral":
                this.compileTemplateLiteral(expr);
                break;
            case "NewExpression":
                this.compileNewExpression(expr);
                break;
            case "AwaitExpression":
                this.compileAwaitExpression(expr);
                break;
            case "ThisExpression":
                this.compileThisExpression(expr);
                break;
            default:
                console.warn("Unhandled expression type:", expr.type);
                this.vm.movImm(VReg.RET, 0);
        }
    },

    // 编译 new 表达式
    // 支持 new Int(x), new Float(x), new Array(...), new Date() 等
    compileNewExpression(expr) {
        // 支持 Number.Int32 等子类型
        if (expr.callee && expr.callee.type === "MemberExpression") {
            const obj = expr.callee.object;
            const prop = expr.callee.property;
            if (obj.type === "Identifier" && obj.name === "Number" && prop.type === "Identifier") {
                const subtypeName = prop.name;
                const args = expr.arguments || [];
                this.compileNumberSubtype(subtypeName, args);
                return;
            }
        }

        if (!expr.callee || expr.callee.type !== "Identifier") {
            // 复杂的 callee，暂不支持
            this.vm.movImm(VReg.RET, 0);
            return;
        }

        const typeName = expr.callee.name;
        const args = expr.arguments || [];

        switch (typeName) {
            case "Int":
                // new Int(value) - 返回整数值
                if (args.length > 0) {
                    this.compileExpressionAsInt(args[0]);
                } else {
                    this.vm.movImm(VReg.RET, 0);
                }
                break;

            case "Float":
            case "Number":
                // new Float(value) / new Number(value) - 返回 IEEE 754 值 (Float64)
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                } else {
                    // 返回 0.0
                    this.vm.movImm(VReg.RET, 0);
                }
                break;

            // Number 子类型 - 整数
            case "Int8":
            case "Int16":
            case "Int32":
            case "Int64":
            case "Uint8":
            case "Uint16":
            case "Uint32":
            case "Uint64":
            // Number 子类型 - 浮点
            case "Float16":
            case "Float32":
            case "Float64":
                this.compileNumberSubtype(typeName, args);
                break;

            case "Array":
                // new Array(len) 或 new Array(a, b, c)
                if (args.length === 0) {
                    // 空数组
                    this.compileArrayExpression({ elements: [] });
                } else if (args.length === 1 && args[0].type === "Literal" && typeof args[0].value === "number") {
                    // new Array(len) - 创建指定长度的数组
                    const len = Math.trunc(args[0].value);
                    this.compileArrayExpression({ elements: new Array(len).fill({ type: "Literal", value: undefined }) });
                } else {
                    // new Array(a, b, c) - 等同于 [a, b, c]
                    this.compileArrayExpression({ elements: args });
                }
                break;

            case "Object":
                // new Object() - 空对象
                this.compileObjectExpression({ properties: [] });
                break;

            case "Date":
                // new Date() - 创建 Date 对象
                if (args.length > 0) {
                    const arg = args[0];
                    // 检查是否是字符串字面量
                    if (arg.type === "StringLiteral" || (arg.type === "Literal" && typeof arg.value === "string")) {
                        // new Date("ISO-string") - 从字符串创建
                        this.compileExpression(arg);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_date_new_from_string");
                    } else {
                        // new Date(timestamp) - 从时间戳创建
                        this.compileExpression(arg);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_date_new");
                    }
                } else {
                    // new Date() - 传入 0，让 _date_new 获取当前时间
                    this.vm.movImm(VReg.A0, 0);
                    this.vm.call("_date_new");
                }
                break;

            case "Map":
                // new Map() - 创建空 Map
                this.vm.call("_map_new");
                break;

            case "Set":
                // new Set() - 创建空 Set
                this.vm.call("_set_new");
                break;

            case "RegExp":
                // new RegExp(pattern, flags) - 创建 RegExp 对象
                if (args.length >= 1) {
                    // 编译模式字符串
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);

                    // 编译标志（可选）
                    if (args.length >= 2) {
                        this.vm.push(VReg.A0); // 保存模式
                        this.compileExpression(args[1]);
                        this.vm.mov(VReg.A1, VReg.RET); // 标志
                        this.vm.pop(VReg.A0); // 恢复模式
                    } else {
                        this.vm.movImm(VReg.A1, 0); // 默认无标志
                    }
                } else {
                    // 默认空模式
                    this.vm.lea(VReg.A0, "_str_empty");
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.call("_regexp_new");
                break;

            // TypedArray 类型
            case "Int8Array":
            case "Uint8Array":
            case "Uint8ClampedArray":
            case "Int16Array":
            case "Uint16Array":
            case "Int32Array":
            case "Uint32Array":
            case "BigInt64Array":
            case "BigUint64Array":
            case "Float32Array":
            case "Float64Array":
                this.compileTypedArrayNew(typeName, args);
                break;

            default:
                // 用户定义的类/构造函数
                this.compileUserClassNew(typeName, args);
                break;
        }
    },

    /**
     * 编译用户定义的类实例化 new ClassName(args)
     * 类信息对象结构:
     *   +0: type (TYPE_CLOSURE = 3)
     *   +8: constructor 地址
     *   +16: prototype 对象地址
     */
    compileUserClassNew(className, args) {
        const offset = this.ctx.getLocal(className);

        // 1. 分配对象内存
        this.vm.movImm(VReg.A0, 256); // 足够大的对象空间
        this.vm.call("_alloc");
        this.vm.mov(VReg.S0, VReg.RET); // S0 = 新对象

        // 2. 设置对象类型
        this.vm.movImm(VReg.V0, 2); // TYPE_OBJECT = 2
        this.vm.store(VReg.S0, 0, VReg.V0);

        if (offset !== undefined) {
            // 类在局部变量中，加载类信息对象
            this.vm.load(VReg.S1, VReg.FP, offset); // S1 = 类信息对象

            // 获取 prototype 并设置到新对象的 __proto__
            this.vm.load(VReg.V0, VReg.S1, 16); // prototype 地址
            this.vm.store(VReg.S0, 24, VReg.V0); // 存储到对象的 __proto__ 槽位

            // 获取构造函数地址
            this.vm.load(VReg.S2, VReg.S1, 8); // S2 = constructor 地址

            // 准备参数：A0 = this (新对象)
            this.vm.mov(VReg.A0, VReg.S0);

            // 编译其他参数
            for (let i = 0; i < args.length && i < 7; i++) {
                this.vm.push(VReg.S0);
                this.vm.push(VReg.S1);
                this.vm.push(VReg.S2);
                this.compileExpression(args[i]);
                this.vm.pop(VReg.S2);
                this.vm.pop(VReg.S1);
                this.vm.pop(VReg.S0);
                const argReg = VReg.A0 + i + 1;
                if (argReg <= VReg.A7) {
                    this.vm.mov(argReg, VReg.RET);
                }
            }

            // 重新设置 A0 = this
            this.vm.mov(VReg.A0, VReg.S0);

            // 间接调用构造函数
            this.vm.callIndirect(VReg.S2);

            // 返回新对象
            this.vm.mov(VReg.RET, VReg.S0);
        } else {
            // 类不在局部变量中，尝试直接调用全局标签
            this.vm.mov(VReg.A0, VReg.S0);

            // 编译参数
            for (let i = 0; i < args.length && i < 7; i++) {
                this.vm.push(VReg.S0);
                this.compileExpression(args[i]);
                this.vm.pop(VReg.S0);
                const argReg = VReg.A0 + i + 1;
                if (argReg <= VReg.A7) {
                    this.vm.mov(argReg, VReg.RET);
                }
            }

            // 重新设置 A0 = this
            this.vm.mov(VReg.A0, VReg.S0);

            // 调用全局类构造函数
            // 注意：这里需要在 collectFunctions 中注册类
            this.vm.call(`_class_${className}`);

            // 返回新对象
            this.vm.mov(VReg.RET, VReg.S0);
        }
    },

    /**
     * 编译 Number 子类型，如 new Number.Int32(value)
     * @param {string} subtypeName - 子类型名称 (Int8, Int16, Int32, Int64, Uint8, ...)
     * @param {Array} args - 构造函数参数
     */
    compileNumberSubtype(subtypeName, args) {
        // 无参数时默认值为 0
        if (args.length === 0) {
            this.vm.movImm(VReg.RET, 0);
            return;
        }

        // 根据子类型选择编译方式
        switch (subtypeName) {
            // 整数类型：直接使用整数编译
            case "Int8":
            case "Int16":
            case "Int32":
            case "Int64":
            case "Uint8":
            case "Uint16":
            case "Uint32":
            case "Uint64":
                this.compileExpressionAsInt(args[0]);
                break;

            // 浮点类型：使用浮点编译
            case "Float16":
            case "Float32":
            case "Float64":
                this.compileExpression(args[0]);
                break;

            default:
                throw new Error(`Unknown Number subtype: ${subtypeName}`);
        }
    },

    /**
     * 编译 TypedArray 构造函数调用
     * @param {string} typeName - TypedArray 类型名称 (Int8Array, Float64Array 等)
     * @param {Array} args - 构造函数参数
     */
    compileTypedArrayNew(typeName, args) {
        // TypedArray 类型映射 (直接使用 TYPE_*_ARRAY 常量)
        const TYPED_ARRAY_TYPES = {
            Int8Array: 0x40, // TYPE_INT8_ARRAY
            Int16Array: 0x41, // TYPE_INT16_ARRAY
            Int32Array: 0x42, // TYPE_INT32_ARRAY
            BigInt64Array: 0x43, // TYPE_INT64_ARRAY
            Uint8Array: 0x50, // TYPE_UINT8_ARRAY
            Uint16Array: 0x51, // TYPE_UINT16_ARRAY
            Uint32Array: 0x52, // TYPE_UINT32_ARRAY
            BigUint64Array: 0x53, // TYPE_UINT64_ARRAY
            Uint8ClampedArray: 0x54, // TYPE_UINT8_CLAMPED_ARRAY
            Float32Array: 0x60, // TYPE_FLOAT32_ARRAY
            Float64Array: 0x61, // TYPE_FLOAT64_ARRAY
        };

        // 元素大小映射
        const ELEM_SIZES = {
            Int8Array: 1,
            Uint8Array: 1,
            Uint8ClampedArray: 1,
            Int16Array: 2,
            Uint16Array: 2,
            Int32Array: 4,
            Uint32Array: 4,
            Float32Array: 4,
            BigInt64Array: 8,
            BigUint64Array: 8,
            Float64Array: 8,
        };

        const arrayType = TYPED_ARRAY_TYPES[typeName];
        const elemSize = ELEM_SIZES[typeName] || 8;
        if (!arrayType) {
            throw new Error(`Unknown TypedArray type: ${typeName}`);
        }

        // 检查参数类型
        if (args.length > 0 && args[0].type === "ArrayExpression") {
            // 参数是数组字面量: new Float64Array([1, 2, 3])
            const elements = args[0].elements;
            const length = elements.length;

            // 辅助函数：获取元素的数值（处理 Literal 和 UnaryExpression）
            const getElementValue = (elem) => {
                if (elem.type === "Literal") {
                    return elem.value;
                } else if (elem.type === "UnaryExpression" && elem.operator === "-") {
                    // 负数: -N
                    if (elem.argument.type === "Literal") {
                        return -elem.argument.value;
                    }
                } else if (elem.type === "UnaryExpression" && elem.operator === "+") {
                    // 正数: +N
                    if (elem.argument.type === "Literal") {
                        return +elem.argument.value;
                    }
                }
                return 0; // 默认值
            };

            // 先创建 TypedArray
            this.vm.movImm(VReg.A0, arrayType);
            this.vm.movImm(VReg.A1, length);
            this.vm.call("_typed_array_new");
            this.vm.push(VReg.RET); // 保存 TypedArray 指针到栈

            // 填充元素 - 根据元素大小存储
            for (let i = 0; i < length; i++) {
                const offset = 16 + i * elemSize;
                const value = getElementValue(elements[i]);

                if (elemSize === 8) {
                    // 8 字节：使用 raw float64 位模式
                    this.compileRawNumericLiteral(value);
                    this.vm.load(VReg.V1, VReg.SP, 0);
                    this.vm.store(VReg.V1, offset, VReg.RET);
                } else if (typeName === "Float32Array") {
                    // Float32Array: 转换为 32 位浮点位模式
                    const f32 = new Float32Array([value]);
                    const u32 = new Uint32Array(f32.buffer);
                    const bits = u32[0];
                    this.vm.load(VReg.V1, VReg.SP, 0);
                    this.vm.movImm(VReg.V0, bits);
                    this.vm.storeByte(VReg.V1, offset, VReg.V0);
                    this.vm.shr(VReg.V2, VReg.V0, 8);
                    this.vm.storeByte(VReg.V1, offset + 1, VReg.V2);
                    this.vm.shr(VReg.V2, VReg.V0, 16);
                    this.vm.storeByte(VReg.V1, offset + 2, VReg.V2);
                    this.vm.shr(VReg.V2, VReg.V0, 24);
                    this.vm.storeByte(VReg.V1, offset + 3, VReg.V2);
                } else if (elemSize === 4) {
                    // Int32Array/Uint32Array: 使用 32 位整数
                    // 使用 >>> 0 确保无符号，然后取各字节
                    const intVal = Math.trunc(value) >>> 0;
                    this.vm.load(VReg.V1, VReg.SP, 0);
                    this.vm.movImm(VReg.V0, intVal);
                    this.vm.storeByte(VReg.V1, offset, VReg.V0);
                    this.vm.shr(VReg.V2, VReg.V0, 8);
                    this.vm.storeByte(VReg.V1, offset + 1, VReg.V2);
                    this.vm.shr(VReg.V2, VReg.V0, 16);
                    this.vm.storeByte(VReg.V1, offset + 2, VReg.V2);
                    this.vm.shr(VReg.V2, VReg.V0, 24);
                    this.vm.storeByte(VReg.V1, offset + 3, VReg.V2);
                } else if (elemSize === 2) {
                    // 2 字节
                    this.vm.load(VReg.V1, VReg.SP, 0);
                    this.vm.movImm(VReg.V0, Math.trunc(value) & 0xffff);
                    this.vm.storeByte(VReg.V1, offset, VReg.V0);
                    this.vm.shr(VReg.V2, VReg.V0, 8);
                    this.vm.storeByte(VReg.V1, offset + 1, VReg.V2);
                } else {
                    // 1 字节
                    this.vm.load(VReg.V1, VReg.SP, 0);
                    this.vm.movImm(VReg.V0, Math.trunc(value) & 0xff);
                    this.vm.storeByte(VReg.V1, offset, VReg.V0);
                }
            }

            this.vm.pop(VReg.RET); // 弹出 TypedArray 指针作为返回值
        } else if (args.length > 0) {
            // 参数是长度: new Float64Array(10)
            this.compileExpressionAsInt(args[0]);
            this.vm.mov(VReg.A1, VReg.RET); // length
            this.vm.movImm(VReg.A0, arrayType);
            this.vm.call("_typed_array_new");
        } else {
            // 无参数: new Float64Array()
            this.vm.movImm(VReg.A0, arrayType);
            this.vm.movImm(VReg.A1, 0);
            this.vm.call("_typed_array_new");
        }
    },
};
