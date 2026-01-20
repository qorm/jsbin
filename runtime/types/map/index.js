// JSBin 运行时 - Map 支持
// 实现 JavaScript Map 对象的基本功能

import { VReg } from "../../../vm/index.js";

// Map 对象内存布局（简化版 - 使用链表）:
// +0:  type (8 bytes) = TYPE_MAP (4)
// +8:  size (8 bytes) - 元素数量
// +16: head (8 bytes) - 链表头指针
//
// 链表节点:
// +0:  key (8 bytes)
// +8:  value (8 bytes)
// +16: next (8 bytes)

const TYPE_MAP = 4;
const MAP_SIZE = 24;
const MAP_NODE_SIZE = 24;

export class MapGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        const vm = this.vm;

        // _map_new - 创建空 Map
        vm.label("_map_new");
        vm.prologue(16, []);

        vm.movImm(VReg.A0, MAP_SIZE);
        vm.call("_alloc");

        vm.movImm(VReg.V1, TYPE_MAP);
        vm.store(VReg.RET, 0, VReg.V1); // type
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.RET, 8, VReg.V1); // size = 0
        vm.store(VReg.RET, 16, VReg.V1); // head = null

        vm.epilogue([], 16);

        // _map_set - 设置键值对
        // A0 = Map 指针, A1 = key, A2 = value
        vm.label("_map_set");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key
        vm.mov(VReg.S2, VReg.A2); // value

        // 查找是否已存在该 key
        vm.load(VReg.S3, VReg.S0, 16); // current = head

        const searchLoopLabel = "_map_set_search";
        const foundLabel = "_map_set_found";
        const notFoundLabel = "_map_set_not_found";
        const doneLabel = "_map_set_done";

        vm.label(searchLoopLabel);
        vm.cmpImm(VReg.S3, 0);
        vm.jeq(notFoundLabel); // 到达链表末尾

        // 比较 key
        vm.load(VReg.V1, VReg.S3, 0); // node.key
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq(foundLabel);

        // 下一个节点
        vm.load(VReg.S3, VReg.S3, 16);
        vm.jmp(searchLoopLabel);

        vm.label(foundLabel);
        // 更新现有节点的值
        vm.store(VReg.S3, 8, VReg.S2);
        vm.jmp(doneLabel);

        vm.label(notFoundLabel);
        // 创建新节点
        vm.movImm(VReg.A0, MAP_NODE_SIZE);
        vm.call("_alloc");

        vm.store(VReg.RET, 0, VReg.S1); // node.key
        vm.store(VReg.RET, 8, VReg.S2); // node.value

        // 插入到链表头部
        vm.load(VReg.V1, VReg.S0, 16); // old head
        vm.store(VReg.RET, 16, VReg.V1); // node.next = old head
        vm.store(VReg.S0, 16, VReg.RET); // head = node

        // 增加 size
        vm.load(VReg.V1, VReg.S0, 8);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.S0, 8, VReg.V1);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S0); // 返回 map
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // _map_get - 获取值
        // A0 = Map 指针, A1 = key
        // 返回 value，如果不存在返回 undefined (0)
        vm.label("_map_get");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key

        vm.load(VReg.V0, VReg.S0, 16); // current = head

        const getLoopLabel = "_map_get_loop";
        const getFoundLabel = "_map_get_found";
        const getNotFoundLabel = "_map_get_not_found";

        vm.label(getLoopLabel);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(getNotFoundLabel);

        vm.load(VReg.V1, VReg.V0, 0);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq(getFoundLabel);

        vm.load(VReg.V0, VReg.V0, 16);
        vm.jmp(getLoopLabel);

        vm.label(getFoundLabel);
        vm.load(VReg.RET, VReg.V0, 8);
        vm.epilogue([VReg.S0, VReg.S1], 32);

        vm.label(getNotFoundLabel);
        vm.movImm(VReg.RET, 0); // undefined
        vm.epilogue([VReg.S0, VReg.S1], 32);

        // _map_has - 检查 key 是否存在
        // A0 = Map 指针, A1 = key
        // 返回 1 (true) 或 0 (false)
        vm.label("_map_has");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.V0, VReg.S0, 16);

        const hasLoopLabel = "_map_has_loop";
        const hasFoundLabel = "_map_has_found";
        const hasNotFoundLabel = "_map_has_not_found";

        vm.label(hasLoopLabel);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(hasNotFoundLabel);

        vm.load(VReg.V1, VReg.V0, 0);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq(hasFoundLabel);

        vm.load(VReg.V0, VReg.V0, 16);
        vm.jmp(hasLoopLabel);

        vm.label(hasFoundLabel);
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1], 32);

        vm.label(hasNotFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 32);

        // _map_delete - 删除键值对
        // A0 = Map 指针, A1 = key
        // 返回 1 如果删除成功，0 如果 key 不存在
        vm.label("_map_delete");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key

        vm.movImm(VReg.S2, 0); // prev = null
        vm.load(VReg.S3, VReg.S0, 16); // current = head

        const delLoopLabel = "_map_del_loop";
        const delFoundLabel = "_map_del_found";
        const delNotFoundLabel = "_map_del_not_found";

        vm.label(delLoopLabel);
        vm.cmpImm(VReg.S3, 0);
        vm.jeq(delNotFoundLabel);

        vm.load(VReg.V1, VReg.S3, 0);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq(delFoundLabel);

        vm.mov(VReg.S2, VReg.S3);
        vm.load(VReg.S3, VReg.S3, 16);
        vm.jmp(delLoopLabel);

        vm.label(delFoundLabel);
        // 从链表中移除
        vm.load(VReg.V1, VReg.S3, 16); // next
        vm.cmpImm(VReg.S2, 0);
        const delFromHeadLabel = "_map_del_from_head";
        vm.jeq(delFromHeadLabel);
        // 从中间删除
        vm.store(VReg.S2, 16, VReg.V1); // prev.next = current.next
        vm.jmp("_map_del_dec_size");

        vm.label(delFromHeadLabel);
        vm.store(VReg.S0, 16, VReg.V1); // head = current.next

        vm.label("_map_del_dec_size");
        // 减少 size
        vm.load(VReg.V1, VReg.S0, 8);
        vm.subImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.S0, 8, VReg.V1);

        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label(delNotFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // _map_size - 获取 Map 大小
        // A0 = Map 指针
        vm.label("_map_size");
        vm.load(VReg.RET, VReg.A0, 8);
        vm.ret();
    }
}
