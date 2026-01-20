// JSBin 运行时 - TypedArray 和 ArrayBuffer 类型
// 支持所有 JavaScript TypedArray 类型和 ArrayBuffer
//
// TypedArray 与普通 Array 的区别：
// - Array: 元素是 boxed 值（带类型头部），每个元素 8 字节指针
// - TypedArray: 元素是 raw 值（无头部），元素大小取决于类型
//
// ArrayBuffer 布局:
// [type:8 | byteLength:8 | buffer...]
//  +0: TYPE_ARRAY_BUFFER (12)
//  +8: 字节长度
// +16: 原始数据缓冲区
//
// TypedArray 布局 (type 直接标识数组类型):
// [type:8 | length:8 | buffer...]
//  +0: TYPE_INT8_ARRAY / TYPE_FLOAT64_ARRAY 等
//  +8: 元素数量
// +16: 原始数据缓冲区

import { VReg } from "../../../vm/registers.js";
import { TYPE_ARRAY_BUFFER, TYPE_INT8_ARRAY, TYPE_INT16_ARRAY, TYPE_INT32_ARRAY, TYPE_INT64_ARRAY, TYPE_UINT8_ARRAY, TYPE_UINT16_ARRAY, TYPE_UINT32_ARRAY, TYPE_UINT64_ARRAY, TYPE_UINT8_CLAMPED_ARRAY, TYPE_FLOAT32_ARRAY, TYPE_FLOAT64_ARRAY } from "../../core/types.js";

// 重新导出类型常量
export { TYPE_INT8_ARRAY, TYPE_INT16_ARRAY, TYPE_INT32_ARRAY, TYPE_INT64_ARRAY, TYPE_UINT8_ARRAY, TYPE_UINT16_ARRAY, TYPE_UINT32_ARRAY, TYPE_UINT64_ARRAY, TYPE_UINT8_CLAMPED_ARRAY, TYPE_FLOAT32_ARRAY, TYPE_FLOAT64_ARRAY };

// TypedArray 名称到类型的映射
export const TypedArrayTypes = {
    Int8Array: TYPE_INT8_ARRAY,
    Int16Array: TYPE_INT16_ARRAY,
    Int32Array: TYPE_INT32_ARRAY,
    BigInt64Array: TYPE_INT64_ARRAY,
    Uint8Array: TYPE_UINT8_ARRAY,
    Uint16Array: TYPE_UINT16_ARRAY,
    Uint32Array: TYPE_UINT32_ARRAY,
    BigUint64Array: TYPE_UINT64_ARRAY,
    Uint8ClampedArray: TYPE_UINT8_CLAMPED_ARRAY,
    Float32Array: TYPE_FLOAT32_ARRAY,
    Float64Array: TYPE_FLOAT64_ARRAY,
};

// 类型到元素大小的映射
export const TypedArrayElemSize = {
    [TYPE_INT8_ARRAY]: 1,
    [TYPE_UINT8_ARRAY]: 1,
    [TYPE_UINT8_CLAMPED_ARRAY]: 1,
    [TYPE_INT16_ARRAY]: 2,
    [TYPE_UINT16_ARRAY]: 2,
    [TYPE_INT32_ARRAY]: 4,
    [TYPE_UINT32_ARRAY]: 4,
    [TYPE_FLOAT32_ARRAY]: 4,
    [TYPE_INT64_ARRAY]: 8,
    [TYPE_UINT64_ARRAY]: 8,
    [TYPE_FLOAT64_ARRAY]: 8,
};

// TypedArray/ArrayBuffer 头部大小 (统一 16 字节)
export const TYPED_ARRAY_HEADER = 16;
export const ARRAY_BUFFER_HEADER = 16;

// ==================== ArrayBuffer ====================

export class ArrayBufferGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    // 创建 ArrayBuffer
    // _arraybuffer_new(byteLength) -> ArrayBuffer 指针
    generateNew() {
        const vm = this.vm;

        vm.label("_arraybuffer_new");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // byteLength

        // 计算总大小: 16 (header) + byteLength
        vm.addImm(VReg.A0, VReg.S0, ARRAY_BUFFER_HEADER);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET);

        // 写入头部
        vm.movImm(VReg.V0, TYPE_ARRAY_BUFFER); // 使用常量
        vm.store(VReg.V1, 0, VReg.V0);
        vm.store(VReg.V1, 8, VReg.S0); // byteLength

        vm.mov(VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0], 16);
    }

    // 获取 ArrayBuffer 字节长度
    // _arraybuffer_bytelength(buf) -> byteLength
    generateByteLength() {
        const vm = this.vm;

        vm.label("_arraybuffer_bytelength");
        vm.load(VReg.RET, VReg.A0, 8);
        vm.ret();
    }

    // ArrayBuffer.prototype.slice(start, end)
    // _arraybuffer_slice(buf, start, end) -> new ArrayBuffer
    generateSlice() {
        const vm = this.vm;

        vm.label("_arraybuffer_slice");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // buf
        vm.mov(VReg.S1, VReg.A1); // start
        vm.mov(VReg.S2, VReg.A2); // end

        // 计算新长度: end - start
        vm.sub(VReg.S3, VReg.S2, VReg.S1);

        // 创建新 ArrayBuffer
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_arraybuffer_new");
        vm.mov(VReg.V1, VReg.RET); // 新 buffer

        // 复制数据 (简化：逐字节复制)
        // TODO: 使用 memcpy 优化
        vm.movImm(VReg.V0, 0); // i = 0
        vm.label("_arraybuffer_slice_loop");
        vm.cmp(VReg.V0, VReg.S3);
        vm.jge("_arraybuffer_slice_done");

        // 计算源偏移: buf + 16 + start + i
        vm.add(VReg.V2, VReg.S1, VReg.V0);
        vm.add(VReg.V2, VReg.S0, VReg.V2);
        vm.loadByte(VReg.V3, VReg.V2, ARRAY_BUFFER_HEADER);

        // 计算目标偏移: newBuf + 16 + i
        vm.add(VReg.V2, VReg.V1, VReg.V0);
        vm.storeByte(VReg.V2, ARRAY_BUFFER_HEADER, VReg.V3);

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_arraybuffer_slice_loop");

        vm.label("_arraybuffer_slice_done");
        vm.mov(VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    generate() {
        this.generateNew();
        this.generateByteLength();
        this.generateSlice();
    }
}

// ==================== TypedArray ====================

export class TypedArrayGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
        this.arch = vm.arch;
    }

    // 创建 TypedArray
    // _typed_array_new(type, length) -> TypedArray 指针
    // type 是 TYPE_INT8_ARRAY / TYPE_FLOAT64_ARRAY 等
    generateNew() {
        const vm = this.vm;

        vm.label("_typed_array_new");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // type (TYPE_*_ARRAY)
        vm.mov(VReg.S1, VReg.A1); // length

        // 根据 type 计算元素大小
        // 1字节: 0x40 (INT8), 0x50 (UINT8), 0x54 (UINT8_CLAMPED)
        // 2字节: 0x41 (INT16), 0x51 (UINT16)
        // 4字节: 0x42 (INT32), 0x52 (UINT32), 0x60 (FLOAT32)
        // 8字节: 0x43 (INT64), 0x53 (UINT64), 0x61 (FLOAT64)
        vm.movImm(VReg.S2, 8); // 默认大小 = 8

        // 检查 1 字节类型
        vm.cmpImm(VReg.S0, TYPE_INT8_ARRAY);
        vm.jeq("_ta_new_size_1");
        vm.cmpImm(VReg.S0, TYPE_UINT8_ARRAY);
        vm.jeq("_ta_new_size_1");
        vm.cmpImm(VReg.S0, TYPE_UINT8_CLAMPED_ARRAY);
        vm.jeq("_ta_new_size_1");
        vm.jmp("_ta_new_check_2");

        vm.label("_ta_new_size_1");
        vm.movImm(VReg.S2, 1);
        vm.jmp("_ta_new_size_done");

        // 检查 2 字节类型
        vm.label("_ta_new_check_2");
        vm.cmpImm(VReg.S0, TYPE_INT16_ARRAY);
        vm.jeq("_ta_new_size_2");
        vm.cmpImm(VReg.S0, TYPE_UINT16_ARRAY);
        vm.jeq("_ta_new_size_2");
        vm.jmp("_ta_new_check_4");

        vm.label("_ta_new_size_2");
        vm.movImm(VReg.S2, 2);
        vm.jmp("_ta_new_size_done");

        // 检查 4 字节类型
        vm.label("_ta_new_check_4");
        vm.cmpImm(VReg.S0, TYPE_INT32_ARRAY);
        vm.jeq("_ta_new_size_4");
        vm.cmpImm(VReg.S0, TYPE_UINT32_ARRAY);
        vm.jeq("_ta_new_size_4");
        vm.cmpImm(VReg.S0, TYPE_FLOAT32_ARRAY);
        vm.jeq("_ta_new_size_4");
        vm.jmp("_ta_new_size_done"); // 默认 8 字节

        vm.label("_ta_new_size_4");
        vm.movImm(VReg.S2, 4);

        vm.label("_ta_new_size_done");

        // 计算总大小: 16 (header) + length * elemSize
        vm.mul(VReg.V0, VReg.S1, VReg.S2);
        vm.addImm(VReg.A0, VReg.V0, TYPED_ARRAY_HEADER);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET); // 保存指针

        // 写入头部: [type | length]
        vm.store(VReg.V1, 0, VReg.S0); // type (直接存储 TYPE_*_ARRAY)
        vm.store(VReg.V1, 8, VReg.S1); // length

        vm.mov(VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // 获取 TypedArray 元素
    // _typed_array_get(arr, index) -> value (raw)
    // 根据 type 字段确定元素大小
    generateGet() {
        const vm = this.vm;

        vm.label("_typed_array_get");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // index

        // 加载 type 字段
        vm.load(VReg.V0, VReg.S0, 0);

        // 简化：目前只处理 8 字节元素 (Float64Array, BigInt64Array 等)
        // TODO: 根据 type 选择正确的元素大小和加载指令
        vm.shl(VReg.V1, VReg.S1, 3); // index * 8
        vm.addImm(VReg.V1, VReg.V1, TYPED_ARRAY_HEADER);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.RET, VReg.V1, 0);

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 设置 TypedArray 元素
    // _typed_array_set(arr, index, value)
    // value 可以是 boxed Number 指针或裸值
    // 如果是 boxed Number（在堆范围内且类型是 TYPE_FLOAT64 等），自动 unbox
    generateSet() {
        const vm = this.vm;

        vm.label("_typed_array_set");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // index
        vm.mov(VReg.S2, VReg.A2); // value (可能是 boxed Number 或 raw)

        // 加载数组类型
        vm.load(VReg.S4, VReg.S0, 0);
        vm.andImm(VReg.S4, VReg.S4, 0xff);

        // 检查 value 是否是 boxed Number（需要 unbox）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.S3, VReg.V0, 0); // S3 = heap_base

        vm.cmp(VReg.S2, VReg.S3);
        vm.jlt("_ta_set_raw"); // 小于 heap_base，当作 raw

        // 检查类型是否是 Number
        vm.load(VReg.V0, VReg.S2, 0);
        vm.andImm(VReg.V0, VReg.V0, 0xff);

        // TYPE_NUMBER (13) 和 TYPE_FLOAT64 (29): offset 8 都是 float64 位模式
        vm.cmpImm(VReg.V0, 13); // TYPE_NUMBER
        vm.jeq("_ta_set_unbox");
        vm.cmpImm(VReg.V0, 29); // TYPE_FLOAT64
        vm.jne("_ta_set_raw"); // 其他类型当作 raw

        // unbox 路径：从 Number 对象中取出 float64 位模式
        vm.label("_ta_set_unbox");
        vm.load(VReg.S2, VReg.S2, 8); // S2 = float64 位模式

        // 如果目标是浮点类型，保持位模式
        vm.cmpImm(VReg.S4, TYPE_FLOAT64_ARRAY);
        vm.jeq("_ta_set_raw");
        vm.cmpImm(VReg.S4, TYPE_FLOAT32_ARRAY);
        vm.jeq("_ta_set_convert_f32");

        // 整数类型：将 float64 位模式转换为整数
        vm.fmovToFloat(0, VReg.S2);
        vm.fcvtzs(VReg.S2, 0);
        vm.jmp("_ta_set_raw");

        // Float32Array: 将 float64 转换为 float32 位模式
        vm.label("_ta_set_convert_f32");
        vm.fmovToFloat(0, VReg.S2);
        vm.fcvtd2s(0, 0); // double to single
        vm.fmovToIntSingle(VReg.S2, 0);

        vm.label("_ta_set_raw");
        // S2 = raw value (整数或位模式), S4 = array type

        // Int8Array (0x40), Uint8Array (0x50), Uint8ClampedArray (0x54)
        vm.cmpImm(VReg.S4, TYPE_INT8_ARRAY);
        vm.jeq("_ta_set_byte");
        vm.cmpImm(VReg.S4, TYPE_UINT8_ARRAY);
        vm.jeq("_ta_set_byte");
        vm.cmpImm(VReg.S4, TYPE_UINT8_CLAMPED_ARRAY);
        vm.jeq("_ta_set_byte");

        // Int16Array (0x41), Uint16Array (0x51)
        vm.cmpImm(VReg.S4, TYPE_INT16_ARRAY);
        vm.jeq("_ta_set_half");
        vm.cmpImm(VReg.S4, TYPE_UINT16_ARRAY);
        vm.jeq("_ta_set_half");

        // Int32Array (0x42), Uint32Array (0x52), Float32Array (0x60)
        vm.cmpImm(VReg.S4, TYPE_INT32_ARRAY);
        vm.jeq("_ta_set_word");
        vm.cmpImm(VReg.S4, TYPE_UINT32_ARRAY);
        vm.jeq("_ta_set_word");
        vm.cmpImm(VReg.S4, TYPE_FLOAT32_ARRAY);
        vm.jeq("_ta_set_word");

        // 默认 8 字节 (Int64Array, Uint64Array, Float64Array)
        vm.shl(VReg.V0, VReg.S1, 3);
        vm.addImm(VReg.V0, VReg.V0, TYPED_ARRAY_HEADER);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S2);
        vm.jmp("_ta_set_done");

        // 1 字节存储
        vm.label("_ta_set_byte");
        vm.add(VReg.V0, VReg.S0, VReg.S1); // arr + index
        vm.addImm(VReg.V0, VReg.V0, TYPED_ARRAY_HEADER);
        vm.storeByte(VReg.V0, 0, VReg.S2);
        vm.jmp("_ta_set_done");

        // 2 字节存储 (little-endian)
        vm.label("_ta_set_half");
        vm.shl(VReg.V0, VReg.S1, 1); // index * 2
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.addImm(VReg.V0, VReg.V0, TYPED_ARRAY_HEADER);
        vm.storeByte(VReg.V0, 0, VReg.S2); // 低字节
        vm.shr(VReg.V1, VReg.S2, 8);
        vm.storeByte(VReg.V0, 1, VReg.V1); // 高字节
        vm.jmp("_ta_set_done");

        // 4 字节存储 (little-endian)
        vm.label("_ta_set_word");
        vm.shl(VReg.V0, VReg.S1, 2); // index * 4
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.addImm(VReg.V0, VReg.V0, TYPED_ARRAY_HEADER);
        vm.storeByte(VReg.V0, 0, VReg.S2); // byte 0
        vm.shr(VReg.V1, VReg.S2, 8);
        vm.storeByte(VReg.V0, 1, VReg.V1); // byte 1
        vm.shr(VReg.V1, VReg.S2, 16);
        vm.storeByte(VReg.V0, 2, VReg.V1); // byte 2
        vm.shr(VReg.V1, VReg.S2, 24);
        vm.storeByte(VReg.V0, 3, VReg.V1); // byte 3
        // vm.jmp("_ta_set_done"); // fall through

        vm.label("_ta_set_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    // 获取 TypedArray 长度
    // _typed_array_length(arr) -> length
    generateLength() {
        const vm = this.vm;

        vm.label("_typed_array_length");
        vm.load(VReg.RET, VReg.A0, 8);
        vm.ret();
    }

    // 生成所有 TypedArray 函数
    generate() {
        this.generateNew();
        this.generateGet();
        this.generateSet();
        this.generateLength();
    }
}
