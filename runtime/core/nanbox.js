// NaN-boxing 常量 - 重新导出自 jsvalue.js
// 此文件保留用于向后兼容，新代码应直接使用 values/jsvalue.js

export {
    // 标签值
    JS_TAG_INT32,
    JS_TAG_BOOL,
    JS_TAG_NULL,
    JS_TAG_UNDEFINED,
    JS_TAG_STRING,
    JS_TAG_OBJECT,
    JS_TAG_ARRAY,
    JS_TAG_FUNCTION,
    // 基础值
    JS_TAG_INT32_BASE,
    JS_TAG_BOOL_BASE,
    JS_TAG_NULL_BASE,
    JS_TAG_UNDEFINED_BASE,
    JS_TAG_STRING_BASE,
    JS_TAG_OBJECT_BASE,
    JS_TAG_ARRAY_BASE,
    JS_TAG_FUNCTION_BASE,
    // 掩码
    JS_TAG_MASK,
    JS_PAYLOAD_MASK,
    // 特殊值
    JS_NULL,
    JS_UNDEFINED,
    JS_TRUE,
    JS_FALSE,
} from "./jsvalue.js";

// 别名（兼容旧代码）
export { JS_NULL as JS_VALUE_NULL } from "./jsvalue.js";
export { JS_UNDEFINED as JS_VALUE_UNDEFINED } from "./jsvalue.js";
export { JS_TRUE as JS_VALUE_TRUE } from "./jsvalue.js";
export { JS_FALSE as JS_VALUE_FALSE } from "./jsvalue.js";

// ============== 堆对象布局 ==============
// NaN-boxing 中，类型信息在 JSValue 中，堆对象不再需要类型头部

// 数组布局: [length:8 | capacity:8 | elements...]
export const ARRAY_LENGTH_OFFSET = 0;
export const ARRAY_CAPACITY_OFFSET = 8;
export const ARRAY_DATA_OFFSET = 16;

// 对象布局: [length:8 | capacity:8 | properties...]
// 每个属性: [key_hash:8 | value:8]
export const OBJECT_LENGTH_OFFSET = 0;
export const OBJECT_CAPACITY_OFFSET = 8;
export const OBJECT_DATA_OFFSET = 16;
export const OBJECT_PROPERTY_SIZE = 16;

// 字符串布局: [length:8 | chars...]
export const STRING_LENGTH_OFFSET = 0;
export const STRING_DATA_OFFSET = 8;

// 闭包布局: [funcPtr:8 | captureCount:8 | captures...]
export const CLOSURE_FUNC_OFFSET = 0;
export const CLOSURE_CAPTURE_COUNT_OFFSET = 8;
export const CLOSURE_CAPTURES_OFFSET = 16;
