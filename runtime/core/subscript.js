// JSBin 运行时 - 下标访问
// 统一处理 Array 和 TypedArray 的下标访问

import { VReg } from "../../vm/registers.js";
import { TYPE_INT8_ARRAY, TYPE_INT16_ARRAY, TYPE_INT32_ARRAY, TYPE_INT64_ARRAY, TYPE_UINT8_ARRAY, TYPE_UINT16_ARRAY, TYPE_UINT32_ARRAY, TYPE_UINT64_ARRAY, TYPE_UINT8_CLAMPED_ARRAY, TYPE_FLOAT32_ARRAY, TYPE_FLOAT64_ARRAY, NUM_INT8, NUM_INT16, NUM_INT32, NUM_INT64, NUM_UINT8, NUM_UINT16, NUM_UINT32, NUM_UINT64, NUM_UINT8_CLAMPED, NUM_FLOAT32, NUM_FLOAT64 } from "./types.js";

export class SubscriptGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    // _subscript_get(arr, index) -> value
    // 根据数组类型（Array 或 TypedArray）选择正确的访问方式
    // TypedArray 返回 boxed Number（类型与元素类型匹配）
    generateGet() {
        const vm = this.vm;

        vm.label("_subscript_get");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // index

        // 加载类型标签
        vm.load(VReg.S3, VReg.S0, 0); // S3 = 完整类型
        vm.andImm(VReg.V0, VReg.S3, 0xff); // V0 = 低 8 位类型

        // 检查是否是 TypedArray (类型 0x40-0x70)
        vm.cmpImm(VReg.V0, 0x40);
        vm.jlt("_subscript_get_array"); // 小于 0x40，是普通 Array

        // ========== TypedArray 路径 ==========
        // 根据类型选择元素大小和加载方式

        // Int8Array (0x40)
        vm.cmpImm(VReg.V0, TYPE_INT8_ARRAY);
        vm.jne("_subscript_get_check_int16");
        vm.add(VReg.V1, VReg.S0, VReg.S1); // arr + index (1 byte per elem)
        vm.loadByte(VReg.S2, VReg.V1, 16);
        // 符号扩展: 如果 bit7 为 1，则高位填 1
        vm.andImm(VReg.V2, VReg.S2, 0x80);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_subscript_get_int8_pos");
        vm.movImm(VReg.V2, -256);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.label("_subscript_get_int8_pos");
        vm.movImm(VReg.S4, NUM_INT8);
        vm.jmp("_subscript_get_box_int");

        // Int16Array (0x41) - 暂时当 2 字节处理
        vm.label("_subscript_get_check_int16");
        vm.cmpImm(VReg.V0, TYPE_INT16_ARRAY);
        vm.jne("_subscript_get_check_int32");
        vm.shl(VReg.V1, VReg.S1, 1); // index * 2
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        // 加载 2 字节 (低字节 + 高字节)
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // 符号扩展
        vm.andImm(VReg.V2, VReg.S2, 0x8000);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_subscript_get_int16_pos");
        vm.movImm(VReg.V2, -65536);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.label("_subscript_get_int16_pos");
        vm.movImm(VReg.S4, NUM_INT16);
        vm.jmp("_subscript_get_box_int");

        // Int32Array (0x42) - 加载 4 字节
        vm.label("_subscript_get_check_int32");
        vm.cmpImm(VReg.V0, TYPE_INT32_ARRAY);
        vm.jne("_subscript_get_check_int64");
        vm.shl(VReg.V1, VReg.S1, 2); // index * 4
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        // 加载 4 字节 (little-endian)
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 18);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 19);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // 32 位符号扩展到 64 位
        vm.andImm(VReg.V2, VReg.S2, 0x80000000);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_subscript_get_int32_pos");
        vm.movImm(VReg.V2, 0xffffffff);
        vm.shl(VReg.V2, VReg.V2, 32);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.label("_subscript_get_int32_pos");
        vm.movImm(VReg.S4, NUM_INT32);
        vm.jmp("_subscript_get_box_int");

        // Int64Array / BigInt64Array (0x43)
        vm.label("_subscript_get_check_int64");
        vm.cmpImm(VReg.V0, TYPE_INT64_ARRAY);
        vm.jne("_subscript_get_check_uint8");
        vm.shl(VReg.V1, VReg.S1, 3); // index * 8
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_INT64);
        vm.jmp("_subscript_get_box_int");

        // Uint8Array (0x50)
        vm.label("_subscript_get_check_uint8");
        vm.cmpImm(VReg.V0, TYPE_UINT8_ARRAY);
        vm.jne("_subscript_get_check_uint16");
        vm.add(VReg.V1, VReg.S0, VReg.S1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        // loadByte 已经是零扩展
        vm.movImm(VReg.S4, NUM_UINT8);
        vm.jmp("_subscript_get_box_int");

        // Uint16Array (0x51)
        vm.label("_subscript_get_check_uint16");
        vm.cmpImm(VReg.V0, TYPE_UINT16_ARRAY);
        vm.jne("_subscript_get_check_uint32");
        vm.shl(VReg.V1, VReg.S1, 1);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.movImm(VReg.S4, NUM_UINT16);
        vm.jmp("_subscript_get_box_int");

        // Uint32Array (0x52)
        vm.label("_subscript_get_check_uint32");
        vm.cmpImm(VReg.V0, TYPE_UINT32_ARRAY);
        vm.jne("_subscript_get_check_uint64");
        vm.shl(VReg.V1, VReg.S1, 2);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 18);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 19);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // Uint32 自动零扩展到 64 位
        vm.movImm(VReg.S4, NUM_UINT32);
        vm.jmp("_subscript_get_box_int");

        // Uint64Array / BigUint64Array (0x53)
        vm.label("_subscript_get_check_uint64");
        vm.cmpImm(VReg.V0, TYPE_UINT64_ARRAY);
        vm.jne("_subscript_get_check_uint8c");
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_UINT64);
        vm.jmp("_subscript_get_box_int");

        // Uint8ClampedArray (0x54)
        vm.label("_subscript_get_check_uint8c");
        vm.cmpImm(VReg.V0, TYPE_UINT8_CLAMPED_ARRAY);
        vm.jne("_subscript_get_check_float32");
        vm.add(VReg.V1, VReg.S0, VReg.S1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_UINT8_CLAMPED);
        vm.jmp("_subscript_get_box_int");

        // Float32Array (0x60) - 加载 4 字节并转换
        vm.label("_subscript_get_check_float32");
        vm.cmpImm(VReg.V0, TYPE_FLOAT32_ARRAY);
        vm.jne("_subscript_get_float64");
        vm.shl(VReg.V1, VReg.S1, 2);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        // 加载 4 字节 float32 位模式
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 18);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 19);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // 使用浮点指令转换 float32 -> float64
        // 将 32 位值移到浮点寄存器，转换，再移回
        vm.fmovToFloatSingle(0, VReg.S2);
        vm.fcvts2d(0, 0); // single to double
        vm.fmovToInt(VReg.S2, 0);
        vm.movImm(VReg.S4, NUM_FLOAT32);
        vm.jmp("_subscript_get_box_float");

        // Float64Array (0x61) - 默认
        vm.label("_subscript_get_float64");
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_FLOAT64);
        vm.jmp("_subscript_get_box_float");

        // Box 整数类型 - 将 raw int 转为 float64 位模式再存储
        vm.label("_subscript_get_box_int");
        // 先将 raw int (S2) 转为 float64 位模式
        // SCVTF: 有符号整数转浮点
        vm.scvtf(0, VReg.S2);
        // FMOV: 浮点位模式移到整数寄存器
        vm.fmovToInt(VReg.S2, 0);

        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        // type = 13 (TYPE_NUMBER) | (subtype << 8)
        vm.shl(VReg.V1, VReg.S4, 8);
        vm.orImm(VReg.V1, VReg.V1, 13); // TYPE_NUMBER = 13
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.S2); // 现在 S2 是 float64 位模式
        vm.jmp("_subscript_get_done");

        // Box 浮点类型
        vm.label("_subscript_get_box_float");
        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        // 对于浮点数，使用 TYPE_FLOAT64 (29) 作为主类型保持兼容
        vm.movImm(VReg.V1, 29); // TYPE_FLOAT64
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.S2);
        vm.jmp("_subscript_get_done");

        // ========== Array 路径 ==========
        // Array 结构: [type:8, length:8, capacity:8, elem0, elem1, ...]
        // 偏移 = 24 + index * 8
        vm.label("_subscript_get_array");
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.RET, VReg.V1, 24);

        vm.label("_subscript_get_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    // _subscript_set(arr, index, value)
    // 根据数组类型选择正确的赋值方式
    generateSet() {
        const vm = this.vm;

        vm.label("_subscript_set");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // index
        vm.mov(VReg.S2, VReg.A2); // value

        // 加载类型标签
        vm.load(VReg.V0, VReg.S0, 0);
        vm.andImm(VReg.V0, VReg.V0, 0xff); // 取低 8 位

        // 检查是否是 TypedArray (类型 0x40-0x70)
        vm.cmpImm(VReg.V0, 0x40);
        vm.jlt("_subscript_set_array"); // 小于 0x40，是普通 Array

        // TypedArray 路径 - 调用 _typed_array_set 来处理 unboxing
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_typed_array_set");
        vm.jmp("_subscript_set_done");

        // Array 路径
        vm.label("_subscript_set_array");
        // Array 结构: [type:8, length:8, capacity:8, elem0, elem1, ...]
        // 偏移 = 24 + index * 8
        vm.shl(VReg.V0, VReg.S1, 3); // index * 8
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.store(VReg.V0, 24, VReg.S2);

        vm.label("_subscript_set_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    generate() {
        this.generateGet();
        this.generateSet();
    }
}
