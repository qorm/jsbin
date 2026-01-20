// JSBin 运行时类型强制转换
// JavaScript 值转换函数
// NaN-boxing 方案

import { VReg } from "../../vm/index.js";
import { JS_NULL, JS_UNDEFINED, JS_FALSE, JS_TAG_BOOL_BASE, JS_TAG_INT32_BASE, JS_TAG_STRING_BASE } from "./jsvalue.js";

export class CoercionGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateToBoolean();
    }

    /**
     * _to_boolean: 将任意 JavaScript 值转换为布尔值
     * 输入: A0 = JSValue
     * 输出: RET = 0 (falsy) 或 1 (truthy)
     *
     * NaN-boxing falsy 值:
     * - 0 (float64 +0.0 = 0x0000000000000000)
     * - -0 (float64 -0.0 = 0x8000000000000000)
     * - false (0x7FF9000000000000)
     * - null (0x7FFA000000000000)
     * - undefined (0x7FFB000000000000)
     * - NaN (0x7FF8000000000000 需要特殊处理)
     * - 空字符串 (0x7FFC000000000000 | ptr，长度为 0)
     *
     * 简化实现：检查常见 falsy 值
     */
    generateToBoolean() {
        const vm = this.vm;

        vm.label("_to_boolean");
        vm.prologue(0, [VReg.S0]); // 保存 S0 以便使用

        const falsyLabel = "_to_bool_falsy";

        // 把参数保存到 S0，因为后面会用到 V0-V7 (都是 X0-X7，会覆盖 A0)
        vm.mov(VReg.S0, VReg.A0);

        // 检查 +0.0 (float64 的 0)
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(falsyLabel);

        // 检查 -0.0 (0x8000000000000000)
        vm.movImm64(VReg.V0, 0x8000000000000000n);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 false (0x7FF9000000000000)
        vm.movImm64(VReg.V0, JS_FALSE);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 null (0x7FFA000000000000)
        vm.movImm64(VReg.V0, JS_NULL);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 undefined (0x7FFB000000000000)
        vm.movImm64(VReg.V0, JS_UNDEFINED);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 INT32 类型的 0 (0x7FF8000000000000)
        vm.movImm64(VReg.V0, JS_TAG_INT32_BASE);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查空字符串：高 16 位是 0x7FFC
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_to_bool_truthy"); // 不是字符串，是 truthy

        // 是字符串，检查是否为空
        // 提取低 48 位作为字符串指针并符号扩展
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.V0, VReg.S0, VReg.V0);
        vm.shlImm(VReg.V0, VReg.V0, 16);
        vm.sarImm(VReg.V0, VReg.V0, 16);
        // 加载第一个字节
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq(falsyLabel); // 空字符串是 falsy
        // 非空字符串，继续到 truthy

        vm.label("_to_bool_truthy");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0], 0);

        vm.label(falsyLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 0);
    }
}
