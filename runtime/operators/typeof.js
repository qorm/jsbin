// JSBin 运行时 - typeof 和 instanceof 运算符
// 提供类型检测功能

import { VReg } from "../../vm/registers.js";
import { TYPE_STRING, TYPE_ARRAY, TYPE_OBJECT, TYPE_CLOSURE, TYPE_FLOAT64 } from "../core/allocator.js";
import { TYPE_ARRAY_BUFFER, TYPE_NUMBER, TYPE_INT8_ARRAY, TYPE_INT16_ARRAY, TYPE_INT32_ARRAY, TYPE_INT64_ARRAY, TYPE_UINT8_ARRAY, TYPE_UINT16_ARRAY, TYPE_UINT32_ARRAY, TYPE_UINT64_ARRAY, TYPE_UINT8_CLAMPED_ARRAY, TYPE_FLOAT32_ARRAY, TYPE_FLOAT64_ARRAY } from "../core/types.js";

export class TypeofGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // typeof 运算符实现
    // 返回指向类型字符串的指针
    generateTypeof() {
        const vm = this.vm;

        vm.label("_typeof");
        vm.prologue(16, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        const isUndefinedLabel = "_typeof_undefined";
        const isNumberLabel = "_typeof_number";
        const isBooleanLabel = "_typeof_boolean";
        const isObjectLabel = "_typeof_object";
        const isFunctionLabel = "_typeof_function";
        const isStringLabel = "_typeof_string";
        const checkHeapLabel = "_typeof_check_heap";
        const checkTypedArrayLabel = "_typeof_check_typed_array";
        const doneLabel = "_typeof_done";

        // ========== 检查 NaN-boxing 格式 ==========
        // 提取高 16 位
        vm.shrImm(VReg.S1, VReg.S0, 48);

        // 检查是否是 NaN-boxing 值 (高16位 >= 0x7FF8)
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jlt(checkHeapLabel); // 不是 NaN-boxing，是堆指针

        // 计算 tag (高 16 位 - 0x7FF8 = tag 0-7)
        vm.subImm(VReg.V0, VReg.S1, 0x7ff8); // V0 = tag

        // Tag 0: int32 -> "number"
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(isNumberLabel);

        // Tag 1: boolean -> "boolean"
        vm.cmpImm(VReg.V0, 1);
        vm.jeq(isBooleanLabel);

        // Tag 2: null -> "object" (JS 历史遗留)
        vm.cmpImm(VReg.V0, 2);
        vm.jeq(isObjectLabel);

        // Tag 3: undefined -> "undefined"
        vm.cmpImm(VReg.V0, 3);
        vm.jeq(isUndefinedLabel);

        // Tag 4: string -> "string"
        vm.cmpImm(VReg.V0, 4);
        vm.jeq(isStringLabel);

        // Tag 5: object -> "object"
        vm.cmpImm(VReg.V0, 5);
        vm.jeq(isObjectLabel);

        // Tag 6: array -> "object"
        vm.cmpImm(VReg.V0, 6);
        vm.jeq(isObjectLabel);

        // Tag 7: function -> "function"
        vm.cmpImm(VReg.V0, 7);
        vm.jeq(isFunctionLabel);

        // 未知 tag，默认 object
        vm.jmp(isObjectLabel);

        // ========== 检查堆指针类型 ==========
        vm.label(checkHeapLabel);

        // 检查是否在堆范围内
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_typeof_check_heap_type"); // >= heap_base，是堆对象

        // 小于堆基址，可能是数据段字符串或小整数
        // 检查是否是合理的地址范围（> 0x100000）
        vm.movImm(VReg.V0, 0x100000);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt(isNumberLabel); // < 1MB，当作数字

        // 检查第一个字节是否是可打印字符（ASCII 32-126）
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 32);
        vm.jlt(isNumberLabel);
        vm.cmpImm(VReg.V0, 127);
        vm.jge(isNumberLabel);
        // 是数据段字符串
        vm.jmp(isStringLabel);

        vm.label("_typeof_check_heap_type");
        // 在堆范围内，检查对象类型
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);

        // TYPE_CLOSURE = 3 -> "function"
        vm.cmpImm(VReg.V2, TYPE_CLOSURE);
        vm.jeq(isFunctionLabel);

        // TYPE_STRING = 6 -> "string"
        vm.cmpImm(VReg.V2, TYPE_STRING);
        vm.jeq(isStringLabel);

        // TYPE_NUMBER = 13 -> "number" (boxed number)
        vm.cmpImm(VReg.V2, TYPE_NUMBER);
        vm.jeq(isNumberLabel);

        // TYPE_FLOAT64 = 29 -> "number" (boxed float64)
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jeq(isNumberLabel);

        // 检查 TypedArray 类型范围 (0x40-0x61)
        vm.cmpImm(VReg.V2, 0x40);
        vm.jge(checkTypedArrayLabel);

        // 数组和对象都返回 "object"
        vm.jmp(isObjectLabel);

        // TypedArray 类型检查
        vm.label(checkTypedArrayLabel);
        vm.cmpImm(VReg.V2, 0x70); // 大于所有 TypedArray 类型
        vm.jge(isObjectLabel);
        // TypedArray -> "object" (标准 JS 行为)
        vm.jmp(isObjectLabel);

        // ========== 返回类型字符串 ==========
        vm.label(isUndefinedLabel);
        vm.lea(VReg.RET, "_str_undefined");
        vm.jmp(doneLabel);

        vm.label(isBooleanLabel);
        vm.lea(VReg.RET, "_str_boolean");
        vm.jmp(doneLabel);

        vm.label(isNumberLabel);
        vm.lea(VReg.RET, "_str_number");
        vm.jmp(doneLabel);

        vm.label(isStringLabel);
        vm.lea(VReg.RET, "_str_string");
        vm.jmp(doneLabel);

        vm.label(isFunctionLabel);
        vm.lea(VReg.RET, "_str_function_type");
        vm.jmp(doneLabel);

        vm.label(isObjectLabel);
        vm.lea(VReg.RET, "_str_object_type");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // _get_type_name: 获取详细的类型名称（非标准 typeof，用于调试）
    // 返回 "Int8Array", "Float64Array", "Array", "Object" 等
    generateGetTypeName() {
        const vm = this.vm;

        vm.label("_get_type_name");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        const doneLabel = "_gtn_done";

        // 检查是否为指针
        vm.movImm(VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_gtn_number");

        // 加载类型
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);

        // 基础类型
        vm.cmpImm(VReg.V2, TYPE_ARRAY);
        vm.jeq("_gtn_array");
        vm.cmpImm(VReg.V2, TYPE_OBJECT);
        vm.jeq("_gtn_object");
        vm.cmpImm(VReg.V2, TYPE_STRING);
        vm.jeq("_gtn_string");
        vm.cmpImm(VReg.V2, TYPE_CLOSURE);
        vm.jeq("_gtn_function");
        vm.cmpImm(VReg.V2, TYPE_NUMBER);
        vm.jeq("_gtn_number");
        vm.cmpImm(VReg.V2, TYPE_ARRAY_BUFFER);
        vm.jeq("_gtn_arraybuffer");

        // TypedArray 类型
        vm.cmpImm(VReg.V2, TYPE_INT8_ARRAY);
        vm.jeq("_gtn_int8array");
        vm.cmpImm(VReg.V2, TYPE_INT16_ARRAY);
        vm.jeq("_gtn_int16array");
        vm.cmpImm(VReg.V2, TYPE_INT32_ARRAY);
        vm.jeq("_gtn_int32array");
        vm.cmpImm(VReg.V2, TYPE_INT64_ARRAY);
        vm.jeq("_gtn_bigint64array");
        vm.cmpImm(VReg.V2, TYPE_UINT8_ARRAY);
        vm.jeq("_gtn_uint8array");
        vm.cmpImm(VReg.V2, TYPE_UINT16_ARRAY);
        vm.jeq("_gtn_uint16array");
        vm.cmpImm(VReg.V2, TYPE_UINT32_ARRAY);
        vm.jeq("_gtn_uint32array");
        vm.cmpImm(VReg.V2, TYPE_UINT64_ARRAY);
        vm.jeq("_gtn_biguint64array");
        vm.cmpImm(VReg.V2, TYPE_UINT8_CLAMPED_ARRAY);
        vm.jeq("_gtn_uint8clampedarray");
        vm.cmpImm(VReg.V2, TYPE_FLOAT32_ARRAY);
        vm.jeq("_gtn_float32array");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64_ARRAY);
        vm.jeq("_gtn_float64array");

        // 默认 object
        vm.jmp("_gtn_object");

        // 类型名称标签
        vm.label("_gtn_number");
        vm.lea(VReg.RET, "_str_Number");
        vm.jmp(doneLabel);

        vm.label("_gtn_string");
        vm.lea(VReg.RET, "_str_String");
        vm.jmp(doneLabel);

        vm.label("_gtn_array");
        vm.lea(VReg.RET, "_str_Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_object");
        vm.lea(VReg.RET, "_str_Object");
        vm.jmp(doneLabel);

        vm.label("_gtn_function");
        vm.lea(VReg.RET, "_str_Function");
        vm.jmp(doneLabel);

        vm.label("_gtn_arraybuffer");
        vm.lea(VReg.RET, "_str_ArrayBuffer");
        vm.jmp(doneLabel);

        vm.label("_gtn_int8array");
        vm.lea(VReg.RET, "_str_Int8Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_int16array");
        vm.lea(VReg.RET, "_str_Int16Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_int32array");
        vm.lea(VReg.RET, "_str_Int32Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_bigint64array");
        vm.lea(VReg.RET, "_str_BigInt64Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_uint8array");
        vm.lea(VReg.RET, "_str_Uint8Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_uint16array");
        vm.lea(VReg.RET, "_str_Uint16Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_uint32array");
        vm.lea(VReg.RET, "_str_Uint32Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_biguint64array");
        vm.lea(VReg.RET, "_str_BigUint64Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_uint8clampedarray");
        vm.lea(VReg.RET, "_str_Uint8ClampedArray");
        vm.jmp(doneLabel);

        vm.label("_gtn_float32array");
        vm.lea(VReg.RET, "_str_Float32Array");
        vm.jmp(doneLabel);

        vm.label("_gtn_float64array");
        vm.lea(VReg.RET, "_str_Float64Array");
        vm.jmp(doneLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0], 16);
    }

    // instanceof 运算符
    // A0 = 左操作数（实例）
    // A1 = 右操作数（构造函数标识：1=Array, 2=Object）
    // 返回 1 或 0
    generateInstanceof() {
        const vm = this.vm;

        vm.label("_instanceof");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // 实例
        vm.mov(VReg.S1, VReg.A1); // 构造函数标识

        const isNotPointerLabel = "_instanceof_not_ptr";
        const checkObjectLabel = "_instanceof_check_obj";
        const isArrayLabel = "_instanceof_is_arr";
        const isObjInstanceLabel = "_instanceof_is_obj";
        const doneLabel = "_instanceof_done";

        // 首先检查实例是否为 null/0 或小数字
        vm.movImm(VReg.V1, 0x100000); // 1MB 阈值
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt(isNotPointerLabel);

        // 是指针，加载类型
        vm.load(VReg.V2, VReg.S0, 0); // 加载 header
        vm.andImm(VReg.V2, VReg.V2, 0xff); // 取低 8 位 = type

        // 检查构造函数标识
        vm.movImm(VReg.V3, 1); // 1 = Array
        vm.cmp(VReg.S1, VReg.V3);
        vm.jne(checkObjectLabel);

        // 检查是否为 Array
        vm.movImm(VReg.V3, TYPE_ARRAY);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isArrayLabel);
        vm.jmp(isNotPointerLabel);

        vm.label(isArrayLabel);
        vm.movImm(VReg.RET, 1);
        vm.jmp(doneLabel);

        vm.label(checkObjectLabel);
        // 检查是否为 Object（包括 Array、普通对象、Closure）
        vm.movImm(VReg.V3, 2); // 2 = Object
        vm.cmp(VReg.S1, VReg.V3);
        vm.jne(isNotPointerLabel);

        // Object 检测：type == ARRAY 或 type == OBJECT
        vm.movImm(VReg.V3, TYPE_ARRAY);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isObjInstanceLabel);

        vm.movImm(VReg.V3, TYPE_OBJECT);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isObjInstanceLabel);

        vm.jmp(isNotPointerLabel);

        vm.label(isObjInstanceLabel);
        vm.movImm(VReg.RET, 1);
        vm.jmp(doneLabel);

        vm.label(isNotPointerLabel);
        vm.movImm(VReg.RET, 0);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 生成所有类型检测函数
    generate() {
        this.generateTypeof();
        this.generateGetTypeName();
        this.generateInstanceof();
    }
}
