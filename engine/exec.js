// P0 执行器基元 —— route B 的命根:把一段机器码字节载入进程、可执行、跳入、取回结果。
//
// 本文件是**规格 + 骨架**。实现分两半:
//   (a) JS 侧编排(本文件)——准备代码缓冲、符号地址表,调运行时基元。
//   (b) 运行时基元(需在 runtime/ 或 engine 专属 runtime 里新增)——mmap/mprotect/
//       memcpy/callIndirect,以 syscall + BLR 实现,暴露为 JS 可调用。
//
// ── mmap 可执行内存的平台差异(P0 必须正确处理)──
//   Linux:  mmap(NULL, len, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_ANON, -1, 0)
//           直接 RWX 即可写码再执行(部分加固内核禁 RWX,则 W^X:先 RW 写、mprotect RX)。
//   macOS arm64: **禁 RWX**。必须 MAP_JIT(0x800)+ MAP_PRIVATE|MAP_ANON,PROT_READ|WRITE|EXEC;
//           写码前后用 pthread_jit_write_protect_np(false/true) 切换 W^X;写完 sys_icache_invalidate
//           刷指令缓存(arm64 I/D 缓存不一致会执行到旧字节)。
//   x64:    写码后无需 icache flush(x86 一致性强),但 W^X 仍建议 mprotect。
//
// ── 重定位(P2 接入,P0 先跳过)──
//   eval 片段引用外部符号(_js_add 等)。P0 用**无外部符号**的自足码验证机制;
//   P2 起:对每条 relocation,按类型(ARM64_RELOC_BRANCH26 / PAGE21 / PAGEOFF12、
//   X86_64_RELOC_BRANCH 等)把目标符号的宿主地址回填进代码缓冲,再 mprotect RX。
//
// ── 调用约定 ──
//   跳入的片段签名:fragment(ctxPtr) -> JSValue(NaN-boxed)。ctxPtr 传宿主上下文
//   (全局对象 / 作用域帧 / runtime 符号表指针)。返回值即 eval 结果。
//   用 backend callIndirect(BLR Xn) 跳转;调用前后遵守 callee-saved 契约。

// execCode(codeBytes: Uint8Array, hostSymbols, ctx) -> JSValue
// P0:hostSymbols/ctx 忽略,codeBytes 须自足(无外部符号)。
export function execCode(codeBytes, hostSymbols, ctx) {
    // TODO(P0 运行时基元):
    //   const mem = __engine_mmap_exec(codeBytes.length);   // MAP_JIT/RWX,返回可执行页指针
    //   __engine_jit_write(mem, codeBytes);                 // (macOS)解写保护→memcpy→复写保护→icache flush
    //   const result = __engine_call(mem, ctx);             // BLR mem,传 ctx,取 RET
    //   __engine_munmap(mem, codeBytes.length);             // 或入代码缓存复用
    //   return result;
    throw new Error("execCode P0 运行时基元(__engine_mmap_exec/jit_write/call)未实现");
}

// P0 验收样例(实现后用):arm64 `mov x0, #42; ret` = [0x40,0x05,0x80,0xD2, 0xC0,0x03,0x5F,0xD6]
//   execCode(new Uint8Array([0x40,0x05,0x80,0xd2, 0xc0,0x03,0x5f,0xd6])) 应返回 42。
//   证明"字节→进程内执行→取回结果"闭环通,即 route B 机制成立。
export const P0_SMOKE_ARM64 = [0x40, 0x05, 0x80, 0xd2, 0xc0, 0x03, 0x5f, 0xd6];
