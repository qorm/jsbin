// JSBin 运行时 - Set 支持
// 实现 JavaScript Set 对象的基本功能

import { VReg } from "../../../vm/index.js";

// Set 对象内存布局（简化版 - 使用链表）:
// +0:  type (8 bytes) = TYPE_SET (5)
// +8:  size (8 bytes) - 元素数量
// +16: head (8 bytes) - 链表头指针
//
// 链表节点:
// +0:  value (8 bytes)
// +8:  next (8 bytes)

const TYPE_SET = 5;
const SET_SIZE = 24;
const SET_NODE_SIZE = 16;

export class SetGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        const vm = this.vm;

        // _set_new - 创建空 Set
        vm.label("_set_new");
        vm.prologue(16, []);

        vm.movImm(VReg.A0, SET_SIZE);
        vm.call("_alloc");

        vm.movImm(VReg.V1, TYPE_SET);
        vm.store(VReg.RET, 0, VReg.V1); // type
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.RET, 8, VReg.V1); // size = 0
        vm.store(VReg.RET, 16, VReg.V1); // head = null

        vm.epilogue([], 16);

        // _set_add - 添加元素
        // A0 = Set 指针, A1 = value
        vm.label("_set_add");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // set
        vm.mov(VReg.S1, VReg.A1); // value

        // 检查是否已存在
        vm.load(VReg.S2, VReg.S0, 16); // current = head

        const addSearchLabel = "_set_add_search";
        const addFoundLabel = "_set_add_found";
        const addNotFoundLabel = "_set_add_not_found";

        vm.label(addSearchLabel);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(addNotFoundLabel);

        vm.load(VReg.V1, VReg.S2, 0);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq(addFoundLabel);

        vm.load(VReg.S2, VReg.S2, 8);
        vm.jmp(addSearchLabel);

        vm.label(addFoundLabel);
        // 已存在，直接返回
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label(addNotFoundLabel);
        // 创建新节点
        vm.movImm(VReg.A0, SET_NODE_SIZE);
        vm.call("_alloc");

        vm.store(VReg.RET, 0, VReg.S1); // node.value

        // 插入到链表头部
        vm.load(VReg.V1, VReg.S0, 16);
        vm.store(VReg.RET, 8, VReg.V1); // node.next = old head
        vm.store(VReg.S0, 16, VReg.RET); // head = node

        // 增加 size
        vm.load(VReg.V1, VReg.S0, 8);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.S0, 8, VReg.V1);

        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // _set_has - 检查元素是否存在
        // A0 = Set 指针, A1 = value
        // 返回 1 (true) 或 0 (false)
        vm.label("_set_has");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.V0, VReg.S0, 16);

        const hasLoopLabel = "_set_has_loop";
        const hasFoundLabel = "_set_has_found";
        const hasNotFoundLabel = "_set_has_not_found";

        vm.label(hasLoopLabel);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(hasNotFoundLabel);

        vm.load(VReg.V1, VReg.V0, 0);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq(hasFoundLabel);

        vm.load(VReg.V0, VReg.V0, 8);
        vm.jmp(hasLoopLabel);

        vm.label(hasFoundLabel);
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1], 32);

        vm.label(hasNotFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 32);

        // _set_delete - 删除元素
        // A0 = Set 指针, A1 = value
        // 返回 1 如果删除成功，0 如果元素不存在
        vm.label("_set_delete");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // set
        vm.mov(VReg.S1, VReg.A1); // value

        vm.movImm(VReg.S2, 0); // prev = null
        vm.load(VReg.S3, VReg.S0, 16); // current = head

        const delLoopLabel = "_set_del_loop";
        const delFoundLabel = "_set_del_found";
        const delNotFoundLabel = "_set_del_not_found";

        vm.label(delLoopLabel);
        vm.cmpImm(VReg.S3, 0);
        vm.jeq(delNotFoundLabel);

        vm.load(VReg.V1, VReg.S3, 0);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq(delFoundLabel);

        vm.mov(VReg.S2, VReg.S3);
        vm.load(VReg.S3, VReg.S3, 8);
        vm.jmp(delLoopLabel);

        vm.label(delFoundLabel);
        vm.load(VReg.V1, VReg.S3, 8); // next
        vm.cmpImm(VReg.S2, 0);
        const delFromHeadLabel = "_set_del_from_head";
        vm.jeq(delFromHeadLabel);
        vm.store(VReg.S2, 8, VReg.V1);
        vm.jmp("_set_del_dec_size");

        vm.label(delFromHeadLabel);
        vm.store(VReg.S0, 16, VReg.V1);

        vm.label("_set_del_dec_size");
        vm.load(VReg.V1, VReg.S0, 8);
        vm.subImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.S0, 8, VReg.V1);

        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label(delNotFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // _set_size - 获取 Set 大小
        // A0 = Set 指针
        vm.label("_set_size");
        vm.load(VReg.RET, VReg.A0, 8);
        vm.ret();

        // _set_clear - 清空 Set
        // A0 = Set 指针
        vm.label("_set_clear");
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.A0, 8, VReg.V1); // size = 0
        vm.store(VReg.A0, 16, VReg.V1); // head = null
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }
}
