// JSBin 静态类型系统
// 在编译时追踪和检查变量类型

// 类型枚举
export const Type = {
    UNKNOWN: "unknown",
    NUMBER: "number", // 未指定的数字类型（默认 Float64）
    STRING: "string",
    BOOLEAN: "boolean",
    NULL: "null",
    UNDEFINED: "undefined",
    ARRAY: "array",
    OBJECT: "object",
    FUNCTION: "function",
    DATE: "Date",
    MAP: "Map",
    SET: "Set",
    REGEXP: "RegExp",
    TYPED_ARRAY: "TypedArray", // TypedArray (Int8Array, Float64Array 等)
    VOID: "void", // 函数无返回值

    // Number 子类型
    INT8: "int8",
    INT16: "int16",
    INT32: "int32",
    INT64: "int64",
    UINT8: "uint8",
    UINT16: "uint16",
    UINT32: "uint32",
    UINT64: "uint64",
    FLOAT16: "float16",
    FLOAT32: "float32", // Number 默认类型 (IEEE 754 double)
    FLOAT64: "float64",
};

// Number 子类型信息
export const NumberSubtype = {
    Int8: { type: Type.INT8, size: 1, signed: true, isFloat: false },
    Int16: { type: Type.INT16, size: 2, signed: true, isFloat: false },
    Int32: { type: Type.INT32, size: 4, signed: true, isFloat: false },
    Int64: { type: Type.INT64, size: 8, signed: true, isFloat: false },
    Uint8: { type: Type.UINT8, size: 1, signed: false, isFloat: false },
    Uint16: { type: Type.UINT16, size: 2, signed: false, isFloat: false },
    Uint32: { type: Type.UINT32, size: 4, signed: false, isFloat: false },
    Uint64: { type: Type.UINT64, size: 8, signed: false, isFloat: false },
    Float16: { type: Type.FLOAT16, size: 2, signed: true, isFloat: true },
    Float32: { type: Type.FLOAT32, size: 4, signed: true, isFloat: true },
    Float64: { type: Type.FLOAT64, size: 8, signed: true, isFloat: true }, // JS Number = IEEE 754 double
};

// 类型到子类型信息的映射
const TypeToSubtype = {
    [Type.INT8]: NumberSubtype.Int8,
    [Type.INT16]: NumberSubtype.Int16,
    [Type.INT32]: NumberSubtype.Int32,
    [Type.INT64]: NumberSubtype.Int64,
    [Type.UINT8]: NumberSubtype.Uint8,
    [Type.UINT16]: NumberSubtype.Uint16,
    [Type.UINT32]: NumberSubtype.Uint32,
    [Type.UINT64]: NumberSubtype.Uint64,
    [Type.FLOAT16]: NumberSubtype.Float16,
    [Type.FLOAT32]: NumberSubtype.Float32,
    [Type.FLOAT64]: NumberSubtype.Float64,
};

// 获取类型的字节大小
export function sizeOf(type) {
    const subtype = TypeToSubtype[type];
    if (subtype) {
        return subtype.size;
    }
    // 基础类型
    switch (type) {
        case Type.NUMBER:
            return 8; // 默认 64 位 (Float64)
        case Type.BOOLEAN:
            return 1;
        case Type.STRING:
        case Type.ARRAY:
        case Type.OBJECT:
        case Type.FUNCTION:
        case Type.DATE:
        case Type.MAP:
        case Type.SET:
        case Type.REGEXP:
            return 8; // 指针大小
        default:
            return 8;
    }
}

// 判断类型是否有符号
export function isSigned(type) {
    const subtype = TypeToSubtype[type];
    return subtype ? subtype.signed : true;
}

// 判断类型是否是浮点
export function isFloatType(type) {
    const subtype = TypeToSubtype[type];
    if (subtype) return subtype.isFloat;
    // NUMBER 可能是任意浮点类型（Float16/32/64），默认当作浮点处理
    return type === Type.NUMBER;
}

// 判断类型是否是整数
export function isIntType(type) {
    const subtype = TypeToSubtype[type];
    if (subtype) return !subtype.isFloat;
    return false;
}

// 类型检查错误收集器
export class TypeChecker {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    error(message, node) {
        const loc = node && node.loc ? ` at line ${node.loc.start.line}` : "";
        this.errors.push(`TypeError${loc}: ${message}`);
    }

    warning(message, node) {
        const loc = node && node.loc ? ` at line ${node.loc.start.line}` : "";
        this.warnings.push(`TypeWarning${loc}: ${message}`);
    }

    hasErrors() {
        return this.errors.length > 0;
    }

    report() {
        for (const w of this.warnings) {
            console.warn(w);
        }
        for (const e of this.errors) {
            console.error(e);
        }
    }
}

// 全局类型检查器实例
export const typeChecker = new TypeChecker();

// 类型兼容性检查
export function isCompatible(from, to) {
    if (from === to) return true;
    if (to === Type.UNKNOWN) return true;
    if (from === Type.UNKNOWN) return true;

    // Number 子类型之间可以互相转换
    if (isIntType(from) && isIntType(to)) return true;
    if (isFloatType(from) && isFloatType(to)) return true;
    if (isIntType(from) && isFloatType(to)) return true;
    if (isFloatType(from) && isIntType(to)) return true; // 会截断

    // null 可以赋值给对象类型
    if (from === Type.NULL && [Type.OBJECT, Type.ARRAY, Type.DATE, Type.MAP, Type.SET, Type.FUNCTION].includes(to)) {
        return true;
    }

    // undefined 可以赋值给任何类型（JavaScript 语义）
    if (from === Type.UNDEFINED) return true;

    return false;
}

// 从 AST 节点推断类型
export function inferType(node, ctx) {
    if (!node) return Type.UNDEFINED;

    switch (node.type) {
        case "NumericLiteral":
        case "Literal":
            if (typeof node.value === "number") {
                // 统一所有数字为 NUMBER 类型
                // 因为我们在运行时使用 Number 对象存储所有数值
                return Type.NUMBER;
            }
            if (typeof node.value === "string") return Type.STRING;
            if (typeof node.value === "boolean") return Type.BOOLEAN;
            if (node.value === null) return Type.NULL;
            if (node.value === undefined) return Type.UNDEFINED;
            if (node.value instanceof RegExp) return Type.REGEXP;
            return Type.UNKNOWN;

        case "StringLiteral":
            return Type.STRING;

        case "BooleanLiteral":
            return Type.BOOLEAN;

        case "NullLiteral":
            return Type.NULL;

        case "ArrayExpression":
            return Type.ARRAY;

        case "ObjectExpression":
            return Type.OBJECT;

        case "FunctionExpression":
        case "ArrowFunctionExpression":
            return Type.FUNCTION;

        case "Identifier":
            if (node.name === "undefined") return Type.UNDEFINED;
            // 从上下文获取变量类型
            if (ctx && ctx.getVarType) {
                return ctx.getVarType(node.name) || Type.UNKNOWN;
            }
            return Type.UNKNOWN;

        case "NewExpression":
            // new Date(), new Int32() 等
            if (node.callee && node.callee.type === "Identifier") {
                switch (node.callee.name) {
                    case "Int":
                        return Type.INT64; // Int 是 Int64 的别名
                    case "Float":
                    case "Number":
                        return Type.NUMBER;
                    case "String":
                        return Type.STRING;
                    case "Boolean":
                        return Type.BOOLEAN;
                    case "Array":
                        return Type.ARRAY;
                    case "Object":
                        return Type.OBJECT;
                    case "Date":
                        return Type.DATE;
                    case "Map":
                        return Type.MAP;
                    case "Set":
                        return Type.SET;
                    case "RegExp":
                        return Type.REGEXP;
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
                        return Type.TYPED_ARRAY;
                    // Number 子类型（语法: new Int8() 实际类型: Number.Int8）
                    case "Int8":
                        return Type.INT8;
                    case "Int16":
                        return Type.INT16;
                    case "Int32":
                        return Type.INT32;
                    case "Int64":
                        return Type.INT64;
                    case "Uint8":
                        return Type.UINT8;
                    case "Uint16":
                        return Type.UINT16;
                    case "Uint32":
                        return Type.UINT32;
                    case "Uint64":
                        return Type.UINT64;
                    case "Float16":
                        return Type.FLOAT16;
                    case "Float32":
                        return Type.FLOAT32;
                    case "Float64":
                        return Type.FLOAT64;
                }
            }
            return Type.OBJECT;

        case "MemberExpression":
            // 成员访问：尝试从对象字面量中推断属性类型
            // 检查对象是否是一个已知变量，其值是对象字面量
            if (node.object && node.object.type === "Identifier" && ctx) {
                const varName = node.object.name;
                // 尝试获取变量的初始值类型信息
                if (ctx.varInitTypes && ctx.varInitTypes[varName]) {
                    const objType = ctx.varInitTypes[varName];
                    if (objType && objType.properties && node.property) {
                        const propName = node.property.name || (node.property.value && String(node.property.value));
                        if (propName && objType.properties[propName]) {
                            return objType.properties[propName];
                        }
                    }
                }
            }
            // 特殊属性处理
            if (node.property && node.property.type === "Identifier") {
                const propName = node.property.name;
                if (propName === "length") {
                    return Type.INT64; // length 通常返回整数
                }
            }
            return Type.UNKNOWN;

        case "CallExpression":
            // 函数调用的返回类型
            // 特殊处理已知返回类型的函数
            if (node.callee && node.callee.type === "MemberExpression") {
                const obj = node.callee.object;
                const prop = node.callee.property;
                // Object.keys(), Object.values(), Object.entries() 返回数组
                if (obj && obj.type === "Identifier" && obj.name === "Object" && prop) {
                    const methodName = prop.name || prop.value;
                    if (methodName === "keys" || methodName === "values" || methodName === "entries") {
                        return Type.ARRAY;
                    }
                }
                // Array 方法返回类型
                const arrayMethods = ["slice", "concat", "filter", "map", "flat", "flatMap"];
                if (prop && arrayMethods.includes(prop.name)) {
                    // 如果对象是数组，这些方法也返回数组
                    const objType = inferType(obj, ctx);
                    if (objType === Type.ARRAY) {
                        return Type.ARRAY;
                    }
                }
            }
            return Type.UNKNOWN;

        case "BinaryExpression":
            return inferBinaryType(node, ctx);

        case "UnaryExpression":
            if (node.operator === "!") return Type.BOOLEAN;
            if (node.operator === "typeof") return Type.STRING;
            if (node.operator === "-" || node.operator === "+") {
                return inferType(node.argument, ctx);
            }
            return Type.UNKNOWN;

        case "ConditionalExpression":
            // 三元表达式：取两个分支的公共类型
            const conseqType = inferType(node.consequent, ctx);
            const altType = inferType(node.alternate, ctx);
            if (conseqType === altType) return conseqType;
            if (isCompatible(conseqType, altType)) return altType;
            if (isCompatible(altType, conseqType)) return conseqType;
            return Type.UNKNOWN;

        default:
            return Type.UNKNOWN;
    }
}

// 推断二元表达式的结果类型
function inferBinaryType(node, ctx) {
    const op = node.operator;
    const leftType = inferType(node.left, ctx);
    const rightType = inferType(node.right, ctx);

    // 比较运算符返回 boolean
    if (["<", "<=", ">", ">=", "==", "===", "!=", "!=="].includes(op)) {
        return Type.BOOLEAN;
    }

    // 逻辑运算符
    if (["&&", "||"].includes(op)) {
        // 返回操作数类型
        return leftType;
    }

    // 算术运算符
    if (["+", "-", "*", "/", "%"].includes(op)) {
        // 字符串拼接
        if (op === "+" && (leftType === Type.STRING || rightType === Type.STRING)) {
            return Type.STRING;
        }
        // 整数运算保持整数（除了除法）
        if (isIntType(leftType) && isIntType(rightType)) {
            if (op === "/") return Type.FLOAT64; // 除法可能产生浮点
            return Type.INT64;
        }
        // 有浮点数参与则结果是浮点
        if (isFloatType(leftType) || isFloatType(rightType)) {
            return Type.FLOAT64;
        }
        return Type.NUMBER;
    }

    // 位运算符返回整数
    if (["&", "|", "^", "<<", ">>", ">>>"].includes(op)) {
        return Type.INT64;
    }

    return Type.UNKNOWN;
}

// 获取类型的可读名称
export function typeName(type) {
    return type || "unknown";
}

// 类型错误
export class TypeError extends Error {
    constructor(message, node) {
        super(message);
        this.name = "TypeError";
        this.node = node;
    }
}
