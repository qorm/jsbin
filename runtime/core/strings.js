// JSBin 运行时 - 内置字符串常量
// 统一管理所有运行时需要的字符串常量

// 字符串常量定义
export const RUNTIME_STRINGS = {
    // 类型字符串
    object: { label: "_str_object", value: "[object Object]" },
    undefined: { label: "_str_undefined", value: "undefined" },
    null: { label: "_str_null", value: "null" },
    true: { label: "_str_true", value: "true" },
    false: { label: "_str_false", value: "false" },
    function: { label: "_str_function", value: "[Function]" },
    array: { label: "_str_array", value: "[Array]" },
    unknown: { label: "_str_unknown", value: "[unknown]" },

    // Promise 相关
    promisePending: { label: "_str_promise_pending", value: "Promise { <pending> }" },
    promiseFulfilledFull: { label: "_str_promise_fulfilled_full", value: "Promise { <fulfilled> }" },
    promiseRejectedFull: { label: "_str_promise_rejected_full", value: "Promise { <rejected> }" },

    // 数组/对象格式化
    lbracket: { label: "_str_lbracket", value: "[" },
    rbracket: { label: "_str_rbracket", value: "]" },
    comma: { label: "_str_comma", value: ", " },
    quote: { label: "_str_quote", value: '"' },

    // typeof 运算符返回值
    number: { label: "_str_number", value: "number" },
    string: { label: "_str_string", value: "string" },
    boolean: { label: "_str_boolean", value: "boolean" },
    functionType: { label: "_str_function_type", value: "function" },
    objectType: { label: "_str_object_type", value: "object" },

    // 详细类型名称 (用于 _get_type_name)
    Number: { label: "_str_Number", value: "Number" },
    String: { label: "_str_String", value: "String" },
    Array: { label: "_str_Array", value: "Array" },
    Object: { label: "_str_Object", value: "Object" },
    Function: { label: "_str_Function", value: "Function" },
    ArrayBuffer: { label: "_str_ArrayBuffer", value: "ArrayBuffer" },

    // TypedArray 类型名称
    Int8Array: { label: "_str_Int8Array", value: "Int8Array" },
    Int16Array: { label: "_str_Int16Array", value: "Int16Array" },
    Int32Array: { label: "_str_Int32Array", value: "Int32Array" },
    BigInt64Array: { label: "_str_BigInt64Array", value: "BigInt64Array" },
    Uint8Array: { label: "_str_Uint8Array", value: "Uint8Array" },
    Uint16Array: { label: "_str_Uint16Array", value: "Uint16Array" },
    Uint32Array: { label: "_str_Uint32Array", value: "Uint32Array" },
    BigUint64Array: { label: "_str_BigUint64Array", value: "BigUint64Array" },
    Uint8ClampedArray: { label: "_str_Uint8ClampedArray", value: "Uint8ClampedArray" },
    Float32Array: { label: "_str_Float32Array", value: "Float32Array" },
    Float64Array: { label: "_str_Float64Array", value: "Float64Array" },

    // ArrayBuffer 格式化
    arraybufferOpen: { label: "_str_arraybuffer_open", value: " { byteLength: " },
    arraybufferClose: { label: "_str_arraybuffer_close", value: " }" },

    // TypedArray 缩略格式（用于多参数 console.log）
    typedarrayAbbrev: { label: "_str_typedarray_abbrev", value: ") [...]" },
};

// 字符串常量生成器
export class StringConstantsGenerator {
    constructor(asm) {
        this.asm = asm;
        this.generated = new Set();
    }

    // 生成单个字符串常量
    generateString(label, value) {
        if (this.generated.has(label)) {
            return;
        }

        this.asm.addDataLabel(label);
        for (let i = 0; i < value.length; i++) {
            this.asm.addDataByte(value.charCodeAt(i));
        }
        this.asm.addDataByte(0); // null terminator
        this.generated.add(label);
    }

    // 生成所有运行时字符串常量
    generateAll() {
        for (const key in RUNTIME_STRINGS) {
            const str = RUNTIME_STRINGS[key];
            this.generateString(str.label, str.value);
        }
    }

    // 生成打印缓冲区
    generatePrintBuffer(size = 24) {
        this.asm.addDataLabel("_print_buf");
        for (let i = 0; i < size; i++) {
            this.asm.addDataByte(0);
        }
    }
}
