// JSBin 运行时 - 浮点数类型
// float32 (IEEE 754 单精度), float64 (IEEE 754 双精度)

import { VReg } from "../../../vm/registers.js";
import { TYPE_FLOAT32, TYPE_FLOAT64 } from "./types.js";

export class FloatsGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
        this.arch = vm.arch;
    }

    // 生成 float32 装箱函数
    // 输入: A0 = float32 位模式 (低 32 位有效)
    // 输出: RET = Number 对象指针
    generateBoxFloat32() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_box_float32");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 清除高 32 位，保留 float32 位模式
        vm.shl(VReg.S0, VReg.S0, 32);
        vm.shr(VReg.S0, VReg.S0, 32);

        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");

        vm.movImm(VReg.V1, TYPE_FLOAT32);
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.S0);

        vm.epilogue([VReg.S0], 16);
    }

    // 生成 float64 装箱函数
    // 输入: A0 = float64 位模式
    // 输出: RET = Number 对象指针
    generateBoxFloat64() {
        const vm = this.vm;

        vm.label("_box_float64");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");

        vm.movImm(VReg.V1, TYPE_FLOAT64);
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.S0);

        vm.epilogue([VReg.S0], 16);
    }

    // 生成拆箱函数
    // 输入: A0 = Number 对象指针
    // 输出: RET = 浮点位模式
    generateUnboxFloat() {
        const vm = this.vm;

        vm.label("_unbox_float");
        vm.load(VReg.RET, VReg.A0, 8);
        vm.ret();
    }

    // 生成 float32 到 float64 转换
    // 输入: A0 = float32 位模式
    // 输出: RET = float64 位模式
    generateFloat32ToFloat64() {
        const vm = this.vm;

        vm.label("_f32_to_f64");
        // 将 32 位模式移到单精度浮点寄存器
        vm.fmovToFloatSingle(0, VReg.A0);
        // 转换到双精度
        vm.fcvts2d(0, 0);
        // 移回整数寄存器
        vm.fmovToInt(VReg.RET, 0);
        vm.ret();
    }

    // 生成 float64 到 float32 转换
    // 输入: A0 = float64 位模式
    // 输出: RET = float32 位模式
    generateFloat64ToFloat32() {
        const vm = this.vm;

        vm.label("_f64_to_f32");
        // 将双精度位模式移到浮点寄存器
        vm.fmovToFloat(0, VReg.A0);
        // 转换到单精度
        vm.fcvtd2s(0, 0);
        // 移回整数寄存器
        vm.fmovToIntSingle(VReg.RET, 0);
        vm.ret();
    }

    // 智能 unbox：将 TYPE_NUMBER 或 TYPE_FLOAT64 转为 float64 位模式
    // 输入: A0 = Number 对象指针
    // 输出: RET = float64 位模式
    // TYPE_NUMBER (13): offset 8 是 raw int，需要 SCVTF
    // TYPE_FLOAT64 (29): offset 8 已经是 float64 位模式
    generateUnboxToFloat64() {
        const vm = this.vm;

        vm.label("_unbox_to_float64");

        // 读取类型
        vm.load(VReg.V0, VReg.A0, 0);
        vm.andImm(VReg.V0, VReg.V0, 0xff);

        // 读取 offset 8 的值
        vm.load(VReg.RET, VReg.A0, 8);

        // 如果是 TYPE_FLOAT64 (29)，直接返回
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jeq("_unbox_to_float64_done");

        // 如果是 TYPE_NUMBER (13)，需要将 raw int 转为 float64 位模式
        vm.cmpImm(VReg.V0, 13); // TYPE_NUMBER
        vm.jne("_unbox_to_float64_done"); // 其他类型直接返回

        // raw int -> float64 位模式
        // SCVTF (有符号整数转浮点)
        vm.scvtf(0, VReg.RET);
        // FMOV (浮点移到整数寄存器)
        vm.fmovToInt(VReg.RET, 0);

        vm.label("_unbox_to_float64_done");
        vm.ret();
    }

    // 生成所有浮点函数
    generate() {
        this.generateBoxFloat32();
        this.generateBoxFloat64();
        this.generateUnboxFloat();
        this.generateUnboxToFloat64();
        // 转换函数在某些后端可能缺少必要的指令
        // 暂时跳过，需要时再启用
        // this.generateFloat32ToFloat64();
        // this.generateFloat64ToFloat32();
    }
}
