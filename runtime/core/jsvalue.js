// JSBin 值系统 - QuickJS 风格的 NaN-boxing
//
// ==================== 设计原理 ====================
//
// 在 64 位系统上，使用 NaN-boxing 将所有 JS 值编码在单个 64 位中：
//
// IEEE 754 double 格式：
//   [sign:1] [exponent:11] [mantissa:52]
//
// 当 exponent = 0x7FF 且 mantissa != 0 时是 NaN。
// 我们利用 NaN 的 mantissa 空间来编码其他类型。
//
// ==================== 编码方案 ====================
//
// 1. 纯 double (浮点数):
//    - 直接存储 64 位 IEEE 754 值
//    - 只要不是我们的特殊 NaN 模式，就是 double
//
// 2. Tagged values (使用特殊 NaN 模式):
//    - 高 13 位: 0x7FF8 >> 3 = 标识 tagged value
//    - 接下来 3 位: tag (0-7)
//    - 低 48 位: payload (指针或立即值)
//
//    布局: [0x7FF : 12 bits] [1:1 bit] [tag : 3 bits] [payload : 48 bits]
//
// ==================== Tag 定义 ====================
//
// 使用简化的 tag 编码 (3 bits = 8 种类型):
//   0: int32        - payload 是 32 位有符号整数
//   1: boolean      - payload 是 0 或 1
//   2: null         - payload 忽略
//   3: undefined    - payload 忽略
//   4: string       - payload 是 char* 指针
//   5: object       - payload 是对象指针
//   6: array        - payload 是数组指针
//   7: function     - payload 是函数指针

// ==================== 常量定义 ====================

// NaN-boxing 基础
export const JS_NAN_BOXING_BASE = 0x7ff8000000000000n; // Quiet NaN 基础
export const JS_TAG_MASK = 0x0007000000000000n; // Tag 位 (bits 48-50)
export const JS_PAYLOAD_MASK = 0x0000ffffffffffffn; // Payload 位 (bits 0-47)

// Tag 值 (左移 48 位后的值)
export const JS_TAG_INT32 = 0;
export const JS_TAG_BOOL = 1;
export const JS_TAG_NULL = 2;
export const JS_TAG_UNDEFINED = 3;
export const JS_TAG_STRING = 4;
export const JS_TAG_OBJECT = 5;
export const JS_TAG_ARRAY = 6;
export const JS_TAG_FUNCTION = 7;

// 预计算的 tag 基础值 (JS_NAN_BOXING_BASE | (tag << 48))
export const JS_TAG_INT32_BASE = 0x7ff8000000000000n; // tag 0
export const JS_TAG_BOOL_BASE = 0x7ff9000000000000n; // tag 1
export const JS_TAG_NULL_BASE = 0x7ffa000000000000n; // tag 2
export const JS_TAG_UNDEFINED_BASE = 0x7ffb000000000000n; // tag 3
export const JS_TAG_STRING_BASE = 0x7ffc000000000000n; // tag 4
export const JS_TAG_OBJECT_BASE = 0x7ffd000000000000n; // tag 5
export const JS_TAG_ARRAY_BASE = 0x7ffe000000000000n; // tag 6
export const JS_TAG_FUNCTION_BASE = 0x7fff000000000000n; // tag 7

// 预定义的特殊值
export const JS_NULL = JS_TAG_NULL_BASE; // 0x7FFA000000000000
export const JS_UNDEFINED = JS_TAG_UNDEFINED_BASE; // 0x7FFB000000000000
export const JS_TRUE = JS_TAG_BOOL_BASE | 1n; // 0x7FF9000000000001
export const JS_FALSE = JS_TAG_BOOL_BASE | 0n; // 0x7FF9000000000000

// ==================== TypedArray 子类型编码 ====================
//
// 对于 JS_TAG_ARRAY，使用 payload 的 bits 44-47 编码子类型：
// - 0 = 普通 Array
// - 1-11 = TypedArray (Int8, Uint8, Uint8C, Int16, Uint16, Int32, Uint32, Float32, Float64, BigInt64, BigUint64)
// - 12 = ArrayBuffer
//
// JSValue 布局: [tag:16][subtype:4][ptr:44]
//
export const JS_ARRAY_SUBTYPE_SHIFT = 44n;
export const JS_ARRAY_SUBTYPE_MASK = 0x0000f00000000000n; // bits 44-47
export const JS_ARRAY_PTR_MASK = 0x00000fffffffffffn; // bits 0-43 (44 bit pointer)

// 获取数组子类型
export function JS_GET_ARRAY_SUBTYPE(v) {
    return Number((v >> JS_ARRAY_SUBTYPE_SHIFT) & 0xfn);
}

// 获取数组指针 (44 位)
export function JS_GET_ARRAY_PTR(v) {
    return v & JS_ARRAY_PTR_MASK;
}

// 创建 TypedArray 值
export function JS_MKTYPEDARRAY(subtype, ptr) {
    return JS_TAG_ARRAY_BASE | (BigInt(subtype) << JS_ARRAY_SUBTYPE_SHIFT) | (BigInt(ptr) & JS_ARRAY_PTR_MASK);
}

// ==================== 类型检测 ====================

// 检查是否是 double (非 tagged value)
// double 的高 12 位不能是 0x7FF (NaN/Inf pattern)，或者是标准 NaN/Inf
export function JS_VALUE_IS_FLOAT64(v) {
    const high16 = (v >> 48n) & 0xffffn;
    // 如果高 16 位 < 0x7FF8，是普通 double
    // 如果高 16 位 > 0x7FFF，也是普通 double (负数 NaN，不应该出现)
    return high16 < 0x7ff8n;
}

// 检查是否是 tagged value
export function JS_VALUE_IS_TAGGED(v) {
    const high16 = (v >> 48n) & 0xffffn;
    return high16 >= 0x7ff8n && high16 <= 0x7fffn;
}

// 获取 tag (0-7)
export function JS_VALUE_GET_TAG(v) {
    if (!JS_VALUE_IS_TAGGED(v)) return -1; // 是 double
    return Number((v >> 48n) & 0x7n);
}

// 获取 payload (48 位)
export function JS_VALUE_GET_PAYLOAD(v) {
    return v & JS_PAYLOAD_MASK;
}

// 获取指针 (符号扩展到 64 位)
export function JS_VALUE_GET_PTR(v) {
    let ptr = v & JS_PAYLOAD_MASK;
    // 符号扩展 (如果第 47 位是 1)
    if (ptr & 0x800000000000n) {
        ptr |= 0xffff000000000000n;
    }
    return ptr;
}

// ==================== 值创建 ====================

export function JS_MKVAL(tag, payload) {
    return JS_NAN_BOXING_BASE | (BigInt(tag) << 48n) | (BigInt(payload) & JS_PAYLOAD_MASK);
}

export function JS_MKINT32(val) {
    return JS_TAG_INT32_BASE | (BigInt(val) & 0xffffffffn);
}

export function JS_MKBOOL(val) {
    return val ? JS_TRUE : JS_FALSE;
}

export function JS_MKSTR(ptr) {
    return JS_TAG_STRING_BASE | (BigInt(ptr) & JS_PAYLOAD_MASK);
}

export function JS_MKOBJ(ptr) {
    return JS_TAG_OBJECT_BASE | (BigInt(ptr) & JS_PAYLOAD_MASK);
}

export function JS_MKARR(ptr) {
    return JS_TAG_ARRAY_BASE | (BigInt(ptr) & JS_PAYLOAD_MASK);
}

export function JS_MKFUNC(ptr) {
    return JS_TAG_FUNCTION_BASE | (BigInt(ptr) & JS_PAYLOAD_MASK);
}

// ==================== 对象布局 ====================
//
// String: 纯 char* (null 结尾的 C 字符串)
//   JSValue 的 payload 直接指向字符数据，无头部
//
// Array:
//   +0: length (int64)
//   +8: capacity (int64)
//   +16: elements[0] (JSValue, 8 bytes)
//   +24: elements[1] (JSValue, 8 bytes)
//   ...
//
// Object:
//   +0: property_count (int64)
//   +8: properties[0].key (char* 指针)
//   +16: properties[0].value (JSValue)
//   +24: properties[1].key (char* 指针)
//   ...
//
// Function/Closure:
//   +0: code_ptr (指向代码)
//   +8: env_ptr (闭包环境，可为 0)
//   ...

// ==================== 运行时生成器 ====================

import { VReg } from "../../vm/index.js";

export class JSValueGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateIsFloat64();
        this.generateGetTag();
        this.generateGetPayload();
        this.generateBoxString();
        this.generateBoxArray();
        this.generateBoxObject();
        this.generateBoxFunction();
        this.generateUnbox();
        this.generateTypeof();
    }

    // _js_is_float64(v) -> 1 if double, 0 if tagged
    generateIsFloat64() {
        const vm = this.vm;

        vm.label("_js_is_float64");
        // A0 = JSValue
        // 检查高 16 位是否 < 0x7FF8
        vm.shrImm(VReg.V0, VReg.A0, 48);
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt("_js_is_float64_true");
        vm.movImm(VReg.RET, 0);
        vm.ret();
        vm.label("_js_is_float64_true");
        vm.movImm(VReg.RET, 1);
        vm.ret();
    }

    // _js_get_tag(v) -> tag (0-7) or -1 for double
    generateGetTag() {
        const vm = this.vm;

        vm.label("_js_get_tag");
        // A0 = JSValue
        // 检查是否是 double
        vm.shrImm(VReg.V0, VReg.A0, 48);
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt("_js_get_tag_double");
        // 是 tagged value，提取 tag (bits 48-50)
        vm.shrImm(VReg.RET, VReg.A0, 48);
        vm.andImm(VReg.RET, VReg.RET, 0x7);
        vm.ret();
        vm.label("_js_get_tag_double");
        vm.movImm(VReg.RET, -1);
        vm.ret();
    }

    // _js_get_payload(v) -> 48-bit payload
    generateGetPayload() {
        const vm = this.vm;

        vm.label("_js_get_payload");
        // A0 = JSValue
        // 提取低 48 位
        // 使用 V1 避免与 RET 冲突
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.A0, VReg.V1);
        vm.ret();
    }

    // _js_box_string(char_ptr) -> JSValue
    generateBoxString() {
        const vm = this.vm;

        vm.label("_js_box_string");
        // A0 = char* 指针
        // 返回 JS_TAG_STRING_BASE | (ptr & PAYLOAD_MASK)
        // 使用 V1, V2 避免与 RET(V0) 冲突
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn); // PAYLOAD_MASK
        vm.and(VReg.RET, VReg.A0, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); // JS_TAG_STRING_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.ret();
    }

    // _js_box_array(array_ptr) -> JSValue
    generateBoxArray() {
        const vm = this.vm;

        vm.label("_js_box_array");
        // A0 = array 指针
        // 使用 V1 避免与 RET(V0) 冲突
        // JSValue 布局: [0x7FFE:16][subtype:4][ptr:44]
        // 普通数组 subtype=0，只保留低 44 位指针
        vm.movImm64(VReg.V1, 0x00000fffffffffffn);
        vm.and(VReg.RET, VReg.A0, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffe000000000000n); // JS_TAG_ARRAY_BASE (subtype=0)
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.ret();
    }

    // _js_box_object(obj_ptr) -> JSValue
    generateBoxObject() {
        const vm = this.vm;

        vm.label("_js_box_object");
        // A0 = object 指针
        // 使用 V1 避免与 RET(V0) 冲突
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.A0, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffd000000000000n); // JS_TAG_OBJECT_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.ret();
    }

    // _js_box_function(func_ptr) -> JSValue
    generateBoxFunction() {
        const vm = this.vm;

        vm.label("_js_box_function");
        // A0 = function/closure 指针
        // 使用 V1 避免与 RET(V0) 冲突
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.A0, VReg.V1);
        vm.movImm64(VReg.V1, 0x7fff000000000000n); // JS_TAG_FUNCTION_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.ret();
    }

    // _js_unbox(v) -> 指针
    // 注意：V0 和 RET 都映射到 X0，所以要避免使用 V0
    // 不再进行符号扩展：用户空间 heap 地址的 bit 47 可能为 1
    // （特别是在某些 QEMU/Docker 环境中），符号扩展会破坏地址
    generateUnbox() {
        const vm = this.vm;

        vm.label("_js_unbox");
        // A0 = JSValue
        // 提取 payload (低 48 位)
        // 使用 V1 作为临时寄存器
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.A0, VReg.V1);
        vm.ret();
    }

    // _js_typeof(v) -> 返回指向类型字符串的 JSValue (NaN-boxed string)
    // 标准 typeof 返回值: "undefined", "boolean", "number", "string", "object", "function", "symbol", "bigint"
    generateTypeof() {
        const vm = this.vm;

        vm.label("_js_typeof");
        vm.prologue(16, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0); // 保存 JSValue

        const doneLabel = "_js_typeof_done";

        // 提取高 16 位 (bits 48-63)
        vm.shrImm(VReg.S1, VReg.S0, 48);

        // 检查是否是 double (高 16 位 < 0x7FF8)
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jlt("_js_typeof_number");

        // 计算 tag (高 16 位 - 0x7FF8 = tag 0-7)
        vm.subImm(VReg.V0, VReg.S1, 0x7ff8); // V0 = tag

        // Tag 0: int32 -> "number"
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_js_typeof_number");

        // Tag 1: boolean -> "boolean"
        vm.cmpImm(VReg.V0, 1);
        vm.jeq("_js_typeof_boolean");

        // Tag 2: null -> "object" (JS 历史遗留)
        vm.cmpImm(VReg.V0, 2);
        vm.jeq("_js_typeof_object");

        // Tag 3: undefined -> "undefined"
        vm.cmpImm(VReg.V0, 3);
        vm.jeq("_js_typeof_undefined");

        // Tag 4: string -> "string"
        vm.cmpImm(VReg.V0, 4);
        vm.jeq("_js_typeof_string");

        // Tag 5: object -> "object"
        vm.cmpImm(VReg.V0, 5);
        vm.jeq("_js_typeof_object");

        // Tag 6: array -> "object"
        vm.cmpImm(VReg.V0, 6);
        vm.jeq("_js_typeof_object");

        // Tag 7: function -> "function"
        vm.cmpImm(VReg.V0, 7);
        vm.jeq("_js_typeof_function");

        // 未知类型 - 默认 "object"
        vm.jmp("_js_typeof_object");

        // ========== 返回类型字符串 ==========
        vm.label("_js_typeof_number");
        vm.lea(VReg.A0, "_str_number");
        vm.call("_js_box_string");
        vm.jmp(doneLabel);

        vm.label("_js_typeof_boolean");
        vm.lea(VReg.A0, "_str_boolean");
        vm.call("_js_box_string");
        vm.jmp(doneLabel);

        vm.label("_js_typeof_undefined");
        vm.lea(VReg.A0, "_str_undefined");
        vm.call("_js_box_string");
        vm.jmp(doneLabel);

        vm.label("_js_typeof_string");
        vm.lea(VReg.A0, "_str_string");
        vm.call("_js_box_string");
        vm.jmp(doneLabel);

        vm.label("_js_typeof_object");
        vm.lea(VReg.A0, "_str_object_type");
        vm.call("_js_box_string");
        vm.jmp(doneLabel);

        vm.label("_js_typeof_function");
        vm.lea(VReg.A0, "_str_function_type");
        vm.call("_js_box_string");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }
}
