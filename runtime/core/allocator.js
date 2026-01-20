// JSBin 统一内存分配器
// 使用 VirtualMachine 抽象，生成跨平台的 allocator 代码
//
// ==================== Go 风格三级分配架构 ====================
//
// ┌──────────────────────────────────────────────────────────────┐
// │  小对象分配器 (Size Classes)                                  │
// │  ┌─────────────────────────────────────────────────────────┐│
// │  │ class[0]: 8B   → [free] → [free] → NULL                ││
// │  │ class[1]: 16B  → [free] → NULL                         ││
// │  │ ...                                                     ││
// │  │ class[17]: 512B → NULL                                 ││
// │  └─────────────────────────────────────────────────────────┘│
// │  小对象 (<=512B)：从对应 size class 的空闲链表分配           │
// │  无锁快速路径，O(1) 分配                                     │
// ├──────────────────────────────────────────────────────────────┤
// │  大对象分配器 (Bump Allocator)                               │
// │  大对象 (>512B)：直接从堆末尾 bump 分配                      │
// │  GC 回收后通过 large_free 链表复用                           │
// ├──────────────────────────────────────────────────────────────┤
// │  堆 (Heap)                                                   │
// │  [..........分配区域..........][→ heap_ptr]                 │
// │  通过 mmap 动态扩展                                          │
// └──────────────────────────────────────────────────────────────┘

import { VReg } from "../../vm/registers.js";
import { JS_TRUE, JS_FALSE, JS_NULL, JS_UNDEFINED } from "./jsvalue.js";

// ==================== 常量定义 ====================

// GC 标记值（三色标记）
export const GC_WHITE = 0; // 未标记（垃圾候选）
export const GC_GRAY = 1; // 待处理（已发现但未遍历）
export const GC_BLACK = 2; // 已处理（可达且已遍历）

// 对象类型 (统一类型常量，用于 GC 遍历)
export const TYPE_RAW = 0; // 原始数据，无引用
export const TYPE_ARRAY = 1; // 数组，包含引用
export const TYPE_OBJECT = 2; // 对象，包含引用
export const TYPE_CLOSURE = 3; // 闭包，包含引用
export const TYPE_MAP = 4;
export const TYPE_SET = 5;
export const TYPE_STRING = 6; // 字符串，无引用
export const TYPE_DATE = 7;
export const TYPE_REGEXP = 8;
export const TYPE_GENERATOR = 9;
export const TYPE_COROUTINE = 10;
export const TYPE_PROMISE = 11; // Promise，包含引用
export const TYPE_TYPED_ARRAY = 12;
export const TYPE_ARRAY_BUFFER = 13;

// Number 子类型 (boxed 数字对象)
export const TYPE_INT8 = 20;
export const TYPE_INT16 = 21;
export const TYPE_INT32 = 22;
export const TYPE_INT64 = 23;
export const TYPE_UINT8 = 24;
export const TYPE_UINT16 = 25;
export const TYPE_UINT32 = 26;
export const TYPE_UINT64 = 27;
export const TYPE_FLOAT32 = 28;
export const TYPE_FLOAT64 = 29; // JavaScript 默认数字类型

// Number 子类型 (用于 TypedArray 元素类型)
export const NUM_INT8 = 0x10;
export const NUM_INT16 = 0x11;
export const NUM_INT32 = 0x12;
export const NUM_INT64 = 0x13;
export const NUM_UINT8 = 0x20;
export const NUM_UINT16 = 0x21;
export const NUM_UINT32 = 0x22;
export const NUM_UINT64 = 0x23;
export const NUM_FLOAT16 = 0x30;
export const NUM_FLOAT32 = 0x31;
export const NUM_FLOAT64 = 0x32;

// ==================== 堆配置（参考 Go runtime）====================
export const INITIAL_HEAP_SIZE = 1048576; // 初始堆大小 1MB
export const HEAP_GROW_SIZE = 65536; // 每次扩展大小 64KB
export const MAX_HEAP_SIZE = 0; // 最大堆大小，0 = 无限制
export const GC_THRESHOLD_PERCENT = 75; // 使用率达到 75% 时触发 GC

// ==================== Go 风格 size classes ====================
// 分配时向上取整到最接近的 size class
export const SIZE_CLASSES = [
    8, // class 0
    16, // class 1
    24, // class 2
    32, // class 3
    48, // class 4
    64, // class 5
    80, // class 6
    96, // class 7
    112, // class 8
    128, // class 9
    160, // class 10
    192, // class 11
    224, // class 12
    256, // class 13
    320, // class 14
    384, // class 15
    448, // class 16
    512, // class 17
];
export const NUM_SIZE_CLASSES = 18;
export const MAX_SMALL_SIZE = 512; // 超过这个大小使用大对象分配器

// 内存对齐
export const ALIGNMENT = 8;

// ==================== 堆元数据结构 ====================
//
// _heap_meta 布局（在数据段）:
//   offset 0:   heap_base      - 堆起始地址
//   offset 8:   heap_size      - 当前堆总大小
//   offset 16:  heap_used      - 已使用字节数
//   offset 24:  gc_running     - GC 是否正在运行
//   offset 32:  free_lists[18] - size class 空闲链表头指针 (18 * 8 = 144 bytes)
//   offset 176: large_free     - 大对象空闲链表
//   offset 184: gc_count       - GC 执行次数
//   offset 192: alloc_count    - 总分配次数
//   offset 200: (reserved)

export const META_HEAP_BASE = 0;
export const META_HEAP_SIZE = 8;
export const META_HEAP_USED = 16;
export const META_GC_RUNNING = 24;
export const META_FREE_LISTS = 32; // 18 * 8 = 144 bytes
export const META_LARGE_FREE = 176;
export const META_GC_COUNT = 184;
export const META_ALLOC_COUNT = 192;
export const META_SIZE = 256; // 预留元数据空间

// ==================== 对象头结构 ====================
//
// 16字节头布局:
//   offset 0 (qword):  flags_and_size
//                      bits 0-1:  mark (WHITE/GRAY/BLACK)
//                      bits 2-5:  type
//                      bits 6-9:  size_class (0-17, 15=large object)
//                      bits 16-63: size (bytes, 用户请求大小)
//   offset 8 (qword):  next_free (指针，仅空闲块使用)

export const HEADER_SIZE = 16;
export const HDR_FLAGS_SIZE = 0;
export const HDR_NEXT = 8;

// 头中的位域操作
export const MARK_MASK = 0x3; // bits 0-1
export const TYPE_SHIFT = 2;
export const TYPE_MASK = 0xf;
export const CLASS_SHIFT = 6;
export const CLASS_MASK = 0xf;
export const SIZE_SHIFT = 16;
export const LARGE_CLASS = 15; // 大对象标记

// 系统调用号
// macOS x64 系统调用需要加 0x2000000 偏移
// macOS ARM64 不需要加偏移
export const Syscall = {
    LINUX_MMAP: 9,
    LINUX_MMAP_ARM64: 222,
    MACOS_MMAP_ARM64: 197,
    MACOS_MMAP_X64: 0x20000c5, // 197 + 0x2000000
    LINUX_MUNMAP: 11,
    LINUX_MUNMAP_ARM64: 215,
    MACOS_MUNMAP_ARM64: 73,
    MACOS_MUNMAP_X64: 0x2000049, // 73 + 0x2000000
    LINUX_EXIT: 60,
    LINUX_EXIT_ARM64: 93,
    MACOS_EXIT_ARM64: 1,
    MACOS_EXIT_X64: 0x2000001, // 1 + 0x2000000
    LINUX_WRITE: 1,
    LINUX_WRITE_ARM64: 64,
    MACOS_WRITE_ARM64: 4,
    MACOS_WRITE_X64: 0x2000004, // 4 + 0x2000000
};

// ==================== 辅助函数 ====================

// 根据请求大小计算 size class 索引
export function getSizeClass(size) {
    for (let i = 0; i < NUM_SIZE_CLASSES; i++) {
        if (size <= SIZE_CLASSES[i]) {
            return i;
        }
    }
    return -1; // 大对象
}

// 构造 flags_and_size 值
export function makeHeader(mark, type, sizeClass, size) {
    return mark | (type << TYPE_SHIFT) | (sizeClass << CLASS_SHIFT) | (size << SIZE_SHIFT);
}

// 从 flags_and_size 提取各字段
export function getMark(flagsAndSize) {
    return flagsAndSize & MARK_MASK;
}

export function getType(flagsAndSize) {
    return (flagsAndSize >> TYPE_SHIFT) & TYPE_MASK;
}

export function getSizeClassFromHeader(flagsAndSize) {
    return (flagsAndSize >> CLASS_SHIFT) & CLASS_MASK;
}

export function getSize(flagsAndSize) {
    return flagsAndSize >> SIZE_SHIFT;
}

export function alignUp(size) {
    return (size + ALIGNMENT - 1) & ~(ALIGNMENT - 1);
}

// 计算分配需要的总大小（包括头）
export function totalSize(requestedSize) {
    return alignUp(requestedSize + HEADER_SIZE);
}

// ==================== 统一 Allocator 生成器 ====================

export class AllocatorGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 获取平台相关的系统调用号
    getSyscallNum(name) {
        const platform = this.vm.platform;
        const arch = this.vm.arch;

        if (platform === "windows") {
            // Windows 使用 API 调用，不用系统调用号
            return -1;
        }

        if (name === "mmap") {
            if (platform === "linux" && arch === "arm64") return Syscall.LINUX_MMAP_ARM64;
            if (platform === "linux") return Syscall.LINUX_MMAP;
            if (platform === "macos" && arch === "arm64") return Syscall.MACOS_MMAP_ARM64;
            if (platform === "macos") return Syscall.MACOS_MMAP_X64;
        }
        if (name === "munmap") {
            if (platform === "linux" && arch === "arm64") return Syscall.LINUX_MUNMAP_ARM64;
            if (platform === "linux") return Syscall.LINUX_MUNMAP;
            if (platform === "macos" && arch === "arm64") return Syscall.MACOS_MUNMAP_ARM64;
            if (platform === "macos") return Syscall.MACOS_MUNMAP_X64;
        }
        if (name === "exit") {
            if (platform === "linux" && arch === "arm64") return Syscall.LINUX_EXIT_ARM64;
            if (platform === "linux") return Syscall.LINUX_EXIT;
            if (platform === "macos" && arch === "arm64") return Syscall.MACOS_EXIT_ARM64;
            if (platform === "macos") return Syscall.MACOS_EXIT_X64;
        }
        if (name === "write") {
            if (platform === "linux" && arch === "arm64") return Syscall.LINUX_WRITE_ARM64;
            if (platform === "linux") return Syscall.LINUX_WRITE;
            if (platform === "macos" && arch === "arm64") return Syscall.MACOS_WRITE_ARM64;
            if (platform === "macos") return Syscall.MACOS_WRITE_X64;
        }
        throw new Error("Unknown syscall: " + name);
    }

    // mmap flags
    getMmapFlags() {
        const platform = this.vm.platform;
        // MAP_ANON | MAP_PRIVATE
        return platform === "linux" ? 0x22 : 0x1002;
    }

    // 生成堆初始化代码
    generateHeapInit() {
        const vm = this.vm;
        const platform = vm.platform;

        vm.label("_heap_init");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        if (platform === "windows") {
            // Windows: 使用 VirtualAlloc API
            // VirtualAlloc(lpAddress, dwSize, flAllocationType, flProtect)
            // lpAddress = NULL, dwSize = INITIAL_HEAP_SIZE
            // flAllocationType = MEM_COMMIT | MEM_RESERVE = 0x3000
            // flProtect = PAGE_READWRITE = 0x04
            vm.movImm(VReg.A0, 0); // lpAddress = NULL
            vm.movImm(VReg.A1, INITIAL_HEAP_SIZE); // dwSize
            vm.movImm(VReg.A2, 0x3000); // MEM_COMMIT | MEM_RESERVE
            vm.movImm(VReg.A3, 0x04); // PAGE_READWRITE

            // 调用 VirtualAlloc (IAT slot 0)
            vm.callWindowsAPI(0);
        } else {
            // Unix: 使用 mmap 系统调用
            // mmap(addr=0, len=INITIAL_HEAP_SIZE, prot=RW, flags=ANON|PRIVATE, fd=-1, offset=0)
            vm.movImm(VReg.A0, 0); // addr = NULL
            vm.movImm(VReg.A1, INITIAL_HEAP_SIZE); // len
            vm.movImm(VReg.A2, 3); // PROT_READ | PROT_WRITE
            vm.movImm(VReg.A3, this.getMmapFlags()); // flags
            vm.movImm(VReg.A4, -1); // fd = -1
            vm.movImm(VReg.A5, 0); // offset = 0

            vm.syscall(this.getSyscallNum("mmap"));
        }

        // 保存 heap base
        vm.mov(VReg.S0, VReg.RET);

        // 检查是否成功 (返回 NULL/0 或 -1 表示失败)
        vm.movImm(VReg.S1, platform === "windows" ? 0 : -1);
        vm.cmp(VReg.S0, VReg.S1);
        vm.jeq("_heap_init_fail");

        // 初始化元数据
        vm.lea(VReg.V1, "_heap_meta");

        // heap_base
        vm.store(VReg.V1, META_HEAP_BASE, VReg.S0);

        // heap_size
        vm.movImm(VReg.V2, INITIAL_HEAP_SIZE);
        vm.store(VReg.V1, META_HEAP_SIZE, VReg.V2);

        // heap_used = 0 (bump allocator 从 heap_base 开始)
        vm.movImm(VReg.V2, 0);
        vm.store(VReg.V1, META_HEAP_USED, VReg.V2);

        // gc_running = 0
        vm.store(VReg.V1, META_GC_RUNNING, VReg.V2);

        // 初始化所有 free_lists[0..17] = NULL
        vm.movImm(VReg.V2, 0);
        for (let i = 0; i < NUM_SIZE_CLASSES; i++) {
            vm.store(VReg.V1, META_FREE_LISTS + i * 8, VReg.V2);
        }

        // large_free = NULL
        vm.store(VReg.V1, META_LARGE_FREE, VReg.V2);

        // gc_count = 0
        vm.store(VReg.V1, META_GC_COUNT, VReg.V2);

        // alloc_count = 0
        vm.store(VReg.V1, META_ALLOC_COUNT, VReg.V2);

        // 初始化 bump pointer (_heap_ptr = heap_base)
        vm.lea(VReg.V1, "_heap_ptr");
        vm.store(VReg.V1, 0, VReg.S0);

        // 保存 heap base（兼容旧代码）
        vm.lea(VReg.V1, "_heap_base");
        vm.store(VReg.V1, 0, VReg.S0);

        vm.epilogue([VReg.S0, VReg.S1], 0);

        // 失败处理
        vm.label("_heap_init_fail");
        vm.movImm(VReg.RET, 0);
        vm.lea(VReg.V1, "_heap_meta");
        vm.store(VReg.V1, META_HEAP_BASE, VReg.RET);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // ==================== Go 风格三级分配器 ====================
    //
    // _alloc(size) 分配流程:
    // 1. size <= 512: 查找对应 size class 的 free list
    //    - 有空闲块: O(1) 从链表头取出
    //    - 无空闲块: 从 bump allocator 分配新块
    // 2. size > 512: 大对象
    //    - 先检查 large_free 链表（best-fit）
    //    - 否则从 bump allocator 分配

    // 生成内存分配代码
    generateAlloc() {
        const vm = this.vm;

        // _alloc: 分配内存
        // A0 = 请求大小（不包括头）
        // 返回: RET = 分配的内存地址（用户数据区），0 表示失败
        vm.label("_alloc");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 对齐请求大小到 8 字节
        vm.addImm(VReg.V0, VReg.A0, 7);
        vm.movImm(VReg.V1, -8);
        vm.and(VReg.S0, VReg.V0, VReg.V1); // S0 = 对齐后的用户大小

        // 判断是小对象还是大对象
        vm.movImm(VReg.V1, MAX_SMALL_SIZE);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jgt("_alloc_large");

        // ========== 小对象分配 ==========
        // 计算 size class 索引
        // 传入对齐后的用户大小
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_get_size_class");
        vm.mov(VReg.S1, VReg.RET); // S1 = size class index

        // 检查 free list
        vm.lea(VReg.V2, "_heap_meta");
        vm.shl(VReg.V3, VReg.S1, 3); // index * 8
        vm.addImm(VReg.V3, VReg.V3, META_FREE_LISTS);
        vm.add(VReg.V3, VReg.V2, VReg.V3); // V3 = &free_lists[class]
        vm.load(VReg.V4, VReg.V3, 0); // V4 = free_lists[class]

        vm.cmpImm(VReg.V4, 0);
        vm.jeq("_alloc_small_bump"); // 空闲链表为空，走 bump

        // 从 free list 取出第一个块
        // V4 指向块头（header），需要读取 next 指针
        vm.load(VReg.V5, VReg.V4, HDR_NEXT); // V5 = next
        vm.store(VReg.V3, 0, VReg.V5); // free_lists[class] = next

        // 清除 next 指针（标记为已分配）
        vm.movImm(VReg.V5, 0);
        vm.store(VReg.V4, HDR_NEXT, VReg.V5);

        // 更新 alloc_count
        vm.lea(VReg.V2, "_heap_meta");
        vm.load(VReg.V5, VReg.V2, META_ALLOC_COUNT);
        vm.addImm(VReg.V5, VReg.V5, 1);
        vm.store(VReg.V2, META_ALLOC_COUNT, VReg.V5);

        // 返回用户数据区地址（跳过头）
        vm.addImm(VReg.RET, VReg.V4, HEADER_SIZE);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 0);

        // ========== 小对象 Bump 分配 ==========
        vm.label("_alloc_small_bump");
        // 计算 size class 对应的实际大小
        // 传入 size class index
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_get_class_size");
        vm.mov(VReg.S2, VReg.RET); // S2 = class size (用户区大小)
        vm.addImm(VReg.S3, VReg.S2, HEADER_SIZE); // S3 = total size

        // 调用 bump allocator
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_bump_alloc");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_alloc_fail");

        vm.mov(VReg.V4, VReg.RET); // V4 = 块头地址

        // 初始化对象头: flags_and_size = size << 16 | class << 6
        vm.shl(VReg.V5, VReg.S0, SIZE_SHIFT); // user_size << 16
        vm.shl(VReg.V6, VReg.S1, CLASS_SHIFT); // class << 6
        vm.or(VReg.V5, VReg.V5, VReg.V6);
        vm.store(VReg.V4, HDR_FLAGS_SIZE, VReg.V5);

        // next = 0
        vm.movImm(VReg.V5, 0);
        vm.store(VReg.V4, HDR_NEXT, VReg.V5);

        // 更新 alloc_count
        vm.lea(VReg.V2, "_heap_meta");
        vm.load(VReg.V5, VReg.V2, META_ALLOC_COUNT);
        vm.addImm(VReg.V5, VReg.V5, 1);
        vm.store(VReg.V2, META_ALLOC_COUNT, VReg.V5);

        // 返回用户数据区
        vm.addImm(VReg.RET, VReg.V4, HEADER_SIZE);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 0);

        // ========== 大对象分配 ==========
        vm.label("_alloc_large");
        // TODO: 检查 large_free 链表 (best-fit)
        // 目前直接走 bump allocator

        vm.addImm(VReg.S3, VReg.S0, HEADER_SIZE); // S3 = total size

        vm.mov(VReg.A0, VReg.S3);
        vm.call("_bump_alloc");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_alloc_fail");

        vm.mov(VReg.V4, VReg.RET); // V4 = 块头地址

        // 初始化对象头: flags_and_size = size << 16 | LARGE_CLASS << 6
        vm.shl(VReg.V5, VReg.S0, SIZE_SHIFT);
        vm.movImm(VReg.V6, LARGE_CLASS << CLASS_SHIFT);
        vm.or(VReg.V5, VReg.V5, VReg.V6);
        vm.store(VReg.V4, HDR_FLAGS_SIZE, VReg.V5);

        // next = 0
        vm.movImm(VReg.V5, 0);
        vm.store(VReg.V4, HDR_NEXT, VReg.V5);

        // 更新 alloc_count
        vm.lea(VReg.V2, "_heap_meta");
        vm.load(VReg.V5, VReg.V2, META_ALLOC_COUNT);
        vm.addImm(VReg.V5, VReg.V5, 1);
        vm.store(VReg.V2, META_ALLOC_COUNT, VReg.V5);

        // 返回用户数据区
        vm.addImm(VReg.RET, VReg.V4, HEADER_SIZE);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 0);

        // ========== 分配失败 ==========
        vm.label("_alloc_fail");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 0);
    }

    // _bump_alloc: 从堆末尾 bump 分配
    // A0 = 请求大小（包括头）
    // 返回: RET = 块头地址，0 表示失败
    generateBumpAlloc() {
        const vm = this.vm;

        vm.label("_bump_alloc");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // S0 = total size

        // 加载当前 heap_ptr
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V2, VReg.V1, 0); // V2 = current ptr

        // 计算新指针
        vm.add(VReg.V3, VReg.V2, VReg.S0); // V3 = new ptr

        // 检查是否超出堆边界
        vm.lea(VReg.V4, "_heap_meta");
        vm.load(VReg.V5, VReg.V4, META_HEAP_BASE);
        vm.load(VReg.V6, VReg.V4, META_HEAP_SIZE);
        vm.add(VReg.V5, VReg.V5, VReg.V6); // V5 = heap end

        vm.cmp(VReg.V3, VReg.V5);
        vm.jgt("_bump_alloc_grow");

        // 更新 heap_ptr
        vm.label("_bump_alloc_ok");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.store(VReg.V1, 0, VReg.V3);

        // 更新 heap_used
        vm.lea(VReg.V4, "_heap_meta");
        vm.load(VReg.V5, VReg.V4, META_HEAP_USED);
        vm.add(VReg.V5, VReg.V5, VReg.S0);
        vm.store(VReg.V4, META_HEAP_USED, VReg.V5);

        // 返回块头地址
        vm.mov(VReg.RET, VReg.V2);
        vm.epilogue([VReg.S0, VReg.S1], 0);

        // 需要扩展堆
        vm.label("_bump_alloc_grow");
        vm.mov(VReg.A0, VReg.S0); // 需要的大小
        vm.call("_heap_grow");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_bump_alloc_fail");

        // 扩展成功，重新加载 heap_ptr 并重试
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.add(VReg.V3, VReg.V2, VReg.S0);
        vm.jmp("_bump_alloc_ok");

        vm.label("_bump_alloc_fail");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // _heap_grow: 扩展堆
    // A0 = 最小需要的额外空间
    // 返回: RET = 1 成功, 0 失败
    generateHeapGrow() {
        const vm = this.vm;
        const platform = vm.platform;

        vm.label("_heap_grow");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2]);

        // 计算需要扩展的大小（至少 HEAP_GROW_SIZE，向上对齐到页大小）
        vm.mov(VReg.S0, VReg.A0);
        vm.movImm(VReg.V1, HEAP_GROW_SIZE);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_heap_grow_calc");
        vm.mov(VReg.S0, VReg.V1);

        vm.label("_heap_grow_calc");
        // 对齐到页大小 (4KB)
        vm.addImm(VReg.S0, VReg.S0, 4095);
        vm.movImm(VReg.V1, -4096);
        vm.and(VReg.S0, VReg.S0, VReg.V1); // S0 = 对齐后的扩展大小

        // 检查是否超过最大堆限制
        // (MAX_HEAP_SIZE == 0 表示无限制)

        // 调用 mmap 分配新内存
        // 注意：这里简化处理，假设 mmap 返回的地址紧跟在当前堆之后
        // 实际实现可能需要处理不连续的情况

        if (platform === "windows") {
            vm.movImm(VReg.A0, 0);
            vm.mov(VReg.A1, VReg.S0);
            vm.movImm(VReg.A2, 0x3000);
            vm.movImm(VReg.A3, 0x04);
            vm.callWindowsAPI(0);
        } else {
            vm.movImm(VReg.A0, 0);
            vm.mov(VReg.A1, VReg.S0);
            vm.movImm(VReg.A2, 3);
            vm.movImm(VReg.A3, this.getMmapFlags());
            vm.movImm(VReg.A4, -1);
            vm.movImm(VReg.A5, 0);
            vm.syscall(this.getSyscallNum("mmap"));
        }

        // 检查是否成功
        vm.movImm(VReg.V1, platform === "windows" ? 0 : -1);
        vm.cmp(VReg.RET, VReg.V1);
        vm.jeq("_heap_grow_fail");

        // 更新 heap_size
        vm.lea(VReg.V2, "_heap_meta");
        vm.load(VReg.V3, VReg.V2, META_HEAP_SIZE);
        vm.add(VReg.V3, VReg.V3, VReg.S0);
        vm.store(VReg.V2, META_HEAP_SIZE, VReg.V3);

        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);

        vm.label("_heap_grow_fail");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);
    }

    // _get_size_class: 根据大小返回 size class 索引
    // A0 = 对齐后的请求大小
    // 返回: RET = class index (0-17)
    generateGetSizeClass() {
        const vm = this.vm;

        vm.label("_get_size_class");
        vm.prologue(0, []);

        // 简化实现：使用分段判断
        // class 0: 8
        vm.cmpImm(VReg.A0, 8);
        vm.jle("_size_class_0");
        // class 1: 16
        vm.cmpImm(VReg.A0, 16);
        vm.jle("_size_class_1");
        // class 2: 24
        vm.cmpImm(VReg.A0, 24);
        vm.jle("_size_class_2");
        // class 3: 32
        vm.cmpImm(VReg.A0, 32);
        vm.jle("_size_class_3");
        // class 4: 48
        vm.cmpImm(VReg.A0, 48);
        vm.jle("_size_class_4");
        // class 5: 64
        vm.cmpImm(VReg.A0, 64);
        vm.jle("_size_class_5");
        // class 6: 80
        vm.cmpImm(VReg.A0, 80);
        vm.jle("_size_class_6");
        // class 7: 96
        vm.cmpImm(VReg.A0, 96);
        vm.jle("_size_class_7");
        // class 8: 112
        vm.cmpImm(VReg.A0, 112);
        vm.jle("_size_class_8");
        // class 9: 128
        vm.cmpImm(VReg.A0, 128);
        vm.jle("_size_class_9");
        // class 10: 160
        vm.cmpImm(VReg.A0, 160);
        vm.jle("_size_class_10");
        // class 11: 192
        vm.cmpImm(VReg.A0, 192);
        vm.jle("_size_class_11");
        // class 12: 224
        vm.cmpImm(VReg.A0, 224);
        vm.jle("_size_class_12");
        // class 13: 256
        vm.cmpImm(VReg.A0, 256);
        vm.jle("_size_class_13");
        // class 14: 320
        vm.cmpImm(VReg.A0, 320);
        vm.jle("_size_class_14");
        // class 15: 384
        vm.cmpImm(VReg.A0, 384);
        vm.jle("_size_class_15");
        // class 16: 448
        vm.cmpImm(VReg.A0, 448);
        vm.jle("_size_class_16");
        // class 17: 512
        vm.movImm(VReg.RET, 17);
        vm.epilogue([], 0);

        for (let i = 0; i <= 16; i++) {
            vm.label(`_size_class_${i}`);
            vm.movImm(VReg.RET, i);
            vm.epilogue([], 0);
        }
    }

    // _get_class_size: 根据 size class 索引返回该类的实际大小
    // A0 = class index
    // 返回: RET = class size
    generateGetClassSize() {
        const vm = this.vm;

        vm.label("_get_class_size");
        vm.prologue(0, []);

        // 使用跳转表或分段判断
        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_class_size_0");
        vm.cmpImm(VReg.A0, 1);
        vm.jeq("_class_size_1");
        vm.cmpImm(VReg.A0, 2);
        vm.jeq("_class_size_2");
        vm.cmpImm(VReg.A0, 3);
        vm.jeq("_class_size_3");
        vm.cmpImm(VReg.A0, 4);
        vm.jeq("_class_size_4");
        vm.cmpImm(VReg.A0, 5);
        vm.jeq("_class_size_5");
        vm.cmpImm(VReg.A0, 6);
        vm.jeq("_class_size_6");
        vm.cmpImm(VReg.A0, 7);
        vm.jeq("_class_size_7");
        vm.cmpImm(VReg.A0, 8);
        vm.jeq("_class_size_8");
        vm.cmpImm(VReg.A0, 9);
        vm.jeq("_class_size_9");
        vm.cmpImm(VReg.A0, 10);
        vm.jeq("_class_size_10");
        vm.cmpImm(VReg.A0, 11);
        vm.jeq("_class_size_11");
        vm.cmpImm(VReg.A0, 12);
        vm.jeq("_class_size_12");
        vm.cmpImm(VReg.A0, 13);
        vm.jeq("_class_size_13");
        vm.cmpImm(VReg.A0, 14);
        vm.jeq("_class_size_14");
        vm.cmpImm(VReg.A0, 15);
        vm.jeq("_class_size_15");
        vm.cmpImm(VReg.A0, 16);
        vm.jeq("_class_size_16");
        // default: class 17
        vm.movImm(VReg.RET, 512);
        vm.epilogue([], 0);

        const sizes = SIZE_CLASSES;
        for (let i = 0; i <= 16; i++) {
            vm.label(`_class_size_${i}`);
            vm.movImm(VReg.RET, sizes[i]);
            vm.epilogue([], 0);
        }
    }

    // _free: 释放内存（放回对应的 free list）
    // A0 = 用户数据区地址
    generateFree() {
        const vm = this.vm;

        vm.label("_free");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        // 检查 NULL
        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_free_done");

        // 计算块头地址
        vm.subImm(VReg.S0, VReg.A0, HEADER_SIZE); // S0 = header addr

        // 读取 flags_and_size
        vm.load(VReg.V0, VReg.S0, HDR_FLAGS_SIZE);

        // 提取 size class
        vm.shr(VReg.V1, VReg.V0, CLASS_SHIFT);
        vm.movImm(VReg.V2, CLASS_MASK);
        vm.and(VReg.S1, VReg.V1, VReg.V2); // S1 = size class

        // 检查是否为大对象
        vm.cmpImm(VReg.S1, LARGE_CLASS);
        vm.jeq("_free_large");

        // 小对象：放入对应的 free list
        vm.lea(VReg.V2, "_heap_meta");
        vm.shl(VReg.V3, VReg.S1, 3);
        vm.addImm(VReg.V3, VReg.V3, META_FREE_LISTS);
        vm.add(VReg.V3, VReg.V2, VReg.V3); // V3 = &free_lists[class]

        // 链表插入头部
        vm.load(VReg.V4, VReg.V3, 0); // V4 = old head
        vm.store(VReg.S0, HDR_NEXT, VReg.V4); // block.next = old head
        vm.store(VReg.V3, 0, VReg.S0); // free_lists[class] = block

        vm.jmp("_free_done");

        // 大对象：放入 large_free 链表
        vm.label("_free_large");
        vm.lea(VReg.V2, "_heap_meta");
        vm.load(VReg.V3, VReg.V2, META_LARGE_FREE);
        vm.store(VReg.S0, HDR_NEXT, VReg.V3);
        vm.store(VReg.V2, META_LARGE_FREE, VReg.S0);

        vm.label("_free_done");
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 生成所有 allocator 相关代码
    generate() {
        this.generateHeapInit();
        this.generateGetSizeClass();
        this.generateGetClassSize();
        this.generateBumpAlloc();
        this.generateHeapGrow();
        this.generateAlloc();
        this.generateFree();
    }

    // 生成数据段定义
    generateDataSection(asm) {
        asm.addDataLabel("_heap_meta");
        for (let i = 0; i < META_SIZE / 8; i++) {
            asm.addDataQword(0);
        }

        asm.addDataLabel("_heap_ptr");
        asm.addDataQword(0);

        asm.addDataLabel("_heap_base");
        asm.addDataQword(0);

        // NaN-boxing 单例值
        asm.addDataLabel("_js_true");
        asm.addDataQword(JS_TRUE);

        asm.addDataLabel("_js_false");
        asm.addDataQword(JS_FALSE);

        asm.addDataLabel("_js_null");
        asm.addDataQword(JS_NULL);

        asm.addDataLabel("_js_undefined");
        asm.addDataQword(JS_UNDEFINED);
    }
}
