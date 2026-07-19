// JSBin 数组运行时 - 搜索方法
// indexOf, includes, lastIndexOf

import { VReg } from "../../../vm/registers.js";
import { ARRAY_HEADER_SIZE } from "./base.js";

// 数组搜索方法 Mixin
export const ArraySearchMixin = {
    // 数组 indexOf
    generateArrayIndexOf() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_indexOf");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.movImm(VReg.S2, 0);

        vm.load(VReg.S3, VReg.S0, 0);

        // 预先检查 value 是否是 Number 对象
        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_indexOf_loop");
        vm.load(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_indexOf_loop");
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_indexOf_loop");
        vm.load(VReg.S4, VReg.S1, 8);

        vm.label("_array_indexOf_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_indexOf_notfound");

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_indexOf_found");

        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_array_indexOf_next");

        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_indexOf_next");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, TYPE_INT8);
        vm.jlt("_array_indexOf_next");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_array_indexOf_next");
        vm.load(VReg.V3, VReg.V1, 8);
        vm.cmp(VReg.V3, VReg.S4);
        vm.jeq("_array_indexOf_found");

        vm.label("_array_indexOf_next");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_indexOf_loop");

        vm.label("_array_indexOf_found");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        vm.label("_array_indexOf_notfound");
        vm.movImm(VReg.RET, -1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    },

    // 数组 includes
    generateArrayIncludes() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_includes");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.movImm(VReg.S2, 0);

        vm.load(VReg.S3, VReg.S0, 0);

        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_includes_loop");
        vm.load(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_includes_loop");
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_includes_loop");
        vm.load(VReg.S4, VReg.S1, 8);

        vm.label("_array_includes_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_includes_false");

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_includes_true");

        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_array_includes_next");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_includes_next");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, TYPE_INT8);
        vm.jlt("_array_includes_next");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_array_includes_next");
        vm.load(VReg.V3, VReg.V1, 8);
        vm.cmp(VReg.V3, VReg.S4);
        vm.jeq("_array_includes_true");

        vm.label("_array_includes_next");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_includes_loop");

        vm.label("_array_includes_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        vm.label("_array_includes_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    },

    // 数组 lastIndexOf
    generateArrayLastIndexOf() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_lastIndexOf");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.S2, VReg.S0, 0);
        vm.subImm(VReg.S2, VReg.S2, 1);

        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_lastIndexOf_loop");
        vm.load(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_lastIndexOf_loop");
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_lastIndexOf_loop");
        vm.load(VReg.S4, VReg.S1, 8);

        vm.label("_array_lastIndexOf_loop");
        vm.cmpImm(VReg.S2, 0);
        vm.jlt("_array_lastIndexOf_notfound");

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_lastIndexOf_found");

        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_array_lastIndexOf_next");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_lastIndexOf_next");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, TYPE_INT8);
        vm.jlt("_array_lastIndexOf_next");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_array_lastIndexOf_next");
        vm.load(VReg.V3, VReg.V1, 8);
        vm.cmp(VReg.V3, VReg.S4);
        vm.jeq("_array_lastIndexOf_found");

        vm.label("_array_lastIndexOf_next");
        vm.subImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_lastIndexOf_loop");

        vm.label("_array_lastIndexOf_found");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        vm.label("_array_lastIndexOf_notfound");
        vm.movImm(VReg.RET, -1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    },
};
