// asm.js 数组运行时 - 转换方法
// slice, concat, join

import { VReg } from "../../../vm/registers.js";
import { ARRAY_HEADER_SIZE } from "./base.js";

// 数组转换方法 Mixin
export const ArrayTransformMixin = {
    // 数组 slice
    generateArraySlice() {
        const vm = this.vm;

        vm.label("_array_slice");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);

        vm.load(VReg.V0, VReg.S0, 0);

        vm.cmpImm(VReg.S2, -1);
        vm.jne("_array_slice_calc");
        vm.mov(VReg.S2, VReg.V0);

        vm.label("_array_slice_calc");
        vm.sub(VReg.S3, VReg.S2, VReg.S1);

        vm.cmpImm(VReg.S3, 0);
        vm.jle("_array_slice_empty");

        vm.shl(VReg.A0, VReg.S3, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        vm.mov(VReg.S4, VReg.RET);

        vm.store(VReg.S4, 0, VReg.S3);
        vm.store(VReg.S4, 8, VReg.S3);

        vm.movImm(VReg.S2, 0);
        vm.label("_array_slice_copy");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_slice_done");

        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.shl(VReg.V0, VReg.V0, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S4, VReg.V0);
        vm.store(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_slice_copy");

        vm.label("_array_slice_done");
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        vm.label("_array_slice_empty");
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    },

    // 数组 concat - 连接两个数组
    generateArrayConcat() {
        const vm = this.vm;

        vm.label("_array_concat");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.S2, VReg.S0, 0);
        vm.load(VReg.S3, VReg.S1, 0);

        vm.add(VReg.S4, VReg.S2, VReg.S3);

        vm.shl(VReg.A0, VReg.S4, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        vm.mov(VReg.S5, VReg.RET);

        vm.store(VReg.S5, 0, VReg.S4);
        vm.store(VReg.S5, 8, VReg.S4);

        // 复制 arr1
        vm.movImm(VReg.V0, 0);
        vm.label("_array_concat_copy1");
        vm.cmp(VReg.V0, VReg.S2);
        vm.jge("_array_concat_copy2_start");

        vm.shl(VReg.V1, VReg.V0, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V2, VReg.S0, VReg.V1);
        vm.load(VReg.V3, VReg.V2, 0);

        vm.add(VReg.V2, VReg.S5, VReg.V1);
        vm.store(VReg.V2, 0, VReg.V3);

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_array_concat_copy1");

        vm.label("_array_concat_copy2_start");
        // 复制 arr2
        vm.movImm(VReg.V0, 0);
        vm.label("_array_concat_copy2");
        vm.cmp(VReg.V0, VReg.S3);
        vm.jge("_array_concat_done");

        vm.shl(VReg.V1, VReg.V0, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V2, VReg.S1, VReg.V1);
        vm.load(VReg.V3, VReg.V2, 0);

        vm.add(VReg.V1, VReg.S2, VReg.V0);
        vm.shl(VReg.V1, VReg.V1, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V2, VReg.S5, VReg.V1);
        vm.store(VReg.V2, 0, VReg.V3);

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_array_concat_copy2");

        vm.label("_array_concat_done");
        vm.mov(VReg.RET, VReg.S5);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 32);
    },

    // 数组 join - 连接为字符串
    generateArrayJoin() {
        const vm = this.vm;

        vm.label("_array_join");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.emitMaskLoad(VReg.V0);
        vm.andMaskReg(VReg.S0, VReg.A0, VReg.V0); // S0 = 裸数组指针
        vm.mov(VReg.S1, VReg.A1); // S1 = 分隔符（装箱字符串）

        vm.load(VReg.S2, VReg.S0, 8); // 长度 @8
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_array_join_empty");

        // S3 = 第一个元素 ToString（valueToStr 返回 content 指针，_js_box_string 装箱）
        vm.load(VReg.A0, VReg.S0, 24);
        vm.call("_valueToStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_box_string");
        vm.mov(VReg.S3, VReg.RET);

        vm.movImm(VReg.S4, 1);
        vm.label("_array_join_loop");
        vm.cmp(VReg.S4, VReg.S2);
        vm.jge("_array_join_done");

        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strconcat");
        vm.mov(VReg.S3, VReg.RET);

        vm.shl(VReg.V0, VReg.S4, 3);
        vm.addImm(VReg.V0, VReg.V0, 24);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.A0, VReg.V0, 0);
        vm.push(VReg.S3); vm.push(VReg.S4);
        vm.call("_valueToStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_box_string");
        vm.mov(VReg.A1, VReg.RET);
        vm.pop(VReg.S4); vm.pop(VReg.S3);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_strconcat");
        vm.mov(VReg.S3, VReg.RET);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_array_join_loop");

        vm.label("_array_join_done");
        vm.mov(VReg.RET, VReg.S3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_array_join_empty");
        vm.lea(VReg.A0, "_str_empty");
        vm.call("_js_box_string");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    },
};
