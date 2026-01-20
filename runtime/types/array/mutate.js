// JSBin 数组运行时 - 原地修改方法
// shift, unshift, reverse, fill

import { VReg } from "../../../vm/registers.js";
import { ARRAY_HEADER_SIZE } from "./base.js";

// 数组原地修改方法 Mixin
export const ArrayMutateMixin = {
    // 数组 shift - 移除第一个元素
    generateArrayShift() {
        const vm = this.vm;

        vm.label("_array_shift");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.load(VReg.S1, VReg.S0, 0);

        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_shift_empty");

        vm.load(VReg.S2, VReg.S0, ARRAY_HEADER_SIZE);

        vm.movImm(VReg.S3, 0);
        vm.subImm(VReg.V0, VReg.S1, 1);

        vm.label("_array_shift_loop");
        vm.cmp(VReg.S3, VReg.V0);
        vm.jge("_array_shift_done");

        vm.addImm(VReg.V1, VReg.S3, 1);
        vm.shl(VReg.V1, VReg.V1, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.V2, VReg.V1, 0);

        vm.shl(VReg.V1, VReg.S3, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_array_shift_loop");

        vm.label("_array_shift_done");
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.store(VReg.S0, 0, VReg.S1);

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_array_shift_empty");
        vm.lea(VReg.RET, "_js_undefined");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    },

    // 数组 unshift - 在开头添加元素
    generateArrayUnshift() {
        const vm = this.vm;

        vm.label("_array_unshift");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.S2, VReg.S0, 0);
        vm.load(VReg.S3, VReg.S0, 8);

        vm.cmp(VReg.S2, VReg.S3);
        vm.jlt("_array_unshift_no_grow");

        // 需要扩容
        vm.shl(VReg.S4, VReg.S3, 1);
        vm.shl(VReg.A0, VReg.S4, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        vm.mov(VReg.V0, VReg.RET);
        vm.movImm(VReg.V1, 1);
        vm.store(VReg.V0, 0, VReg.V1);
        vm.store(VReg.V0, 8, VReg.S4);

        // 复制元素（偏移1位）
        vm.movImm(VReg.V2, 0);
        vm.label("_array_unshift_copy");
        vm.cmp(VReg.V2, VReg.S2);
        vm.jge("_array_unshift_copy_done");

        vm.shl(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.S0, VReg.V3);
        vm.load(VReg.V4, VReg.V3, 0);

        vm.addImm(VReg.V3, VReg.V2, 1);
        vm.shl(VReg.V3, VReg.V3, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.V0, VReg.V3);
        vm.store(VReg.V3, 0, VReg.V4);

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_unshift_copy");

        vm.label("_array_unshift_copy_done");
        vm.mov(VReg.S0, VReg.V0);
        vm.jmp("_array_unshift_insert");

        vm.label("_array_unshift_no_grow");
        // 移动元素向后一位
        vm.mov(VReg.S3, VReg.S2);
        vm.label("_array_unshift_shift");
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_array_unshift_insert");

        vm.subImm(VReg.V1, VReg.S3, 1);
        vm.shl(VReg.V1, VReg.V1, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.V2, VReg.V1, 0);

        vm.shl(VReg.V1, VReg.S3, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_array_unshift_shift");

        vm.label("_array_unshift_insert");
        vm.store(VReg.S0, ARRAY_HEADER_SIZE, VReg.S1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 0, VReg.S2);

        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    },

    // 数组 reverse - 原地反转
    generateArrayReverse() {
        const vm = this.vm;

        vm.label("_array_reverse");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.load(VReg.S1, VReg.S0, 0);

        vm.movImm(VReg.S2, 0);
        vm.subImm(VReg.S3, VReg.S1, 1);

        vm.label("_array_reverse_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_reverse_done");

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        vm.shl(VReg.V1, VReg.S3, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);

        vm.load(VReg.V2, VReg.V0, 0);
        vm.load(VReg.V3, VReg.V1, 0);
        vm.store(VReg.V0, 0, VReg.V3);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_array_reverse_loop");

        vm.label("_array_reverse_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    },

    // 数组 fill - 填充
    generateArrayFill() {
        const vm = this.vm;

        vm.label("_array_fill");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);
        vm.mov(VReg.S3, VReg.A3);

        vm.cmpImm(VReg.S3, -1);
        vm.jne("_array_fill_loop");
        vm.load(VReg.S3, VReg.S0, 0);

        vm.label("_array_fill_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_fill_done");

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_fill_loop");

        vm.label("_array_fill_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    },
};
