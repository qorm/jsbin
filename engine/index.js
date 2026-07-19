// jsbin 引擎库(L2)—— 运行时编译执行引擎入口。
// 独立组件,路线 B(编译器常驻)。见 README.md 架构与阶段。
//
// 现状:P0(执行器基元)未实现——以下 API 为骨架,标注各阶段依赖。
// 逐阶段落地后替换 throw 为实现。

import { Compiler } from "../compiler/index.js";
import { execCode } from "./exec.js";

// jsbin_eval(source[, options]) -> JSValue
// 间接 eval 语义(全局作用域)。直接 eval 的词法捕获属 P4 后续。
export function jsbinEval(source, options) {
    options = options || {};
    // P2:编译成引用外部 runtime 符号的可重定位片段(而非自带 runtime 的完整可执行)。
    const compiler = new Compiler(options.target || "native");
    // TODO(P2):compiler.compileFragment(source) —— 需新增"片段/对象文件"编译模式,
    //   顶层表达式的值成为片段返回值;外部符号(_js_add/_alloc/…)标为 undefined 待重定位。
    // TODO(P1):hostSymbols —— 宿主导出的 runtime 符号地址表,供重定位解析。
    // TODO(P0):execCode(codeBuf, len, hostSymbols) —— mmap 可执行 + 重定位 + callIndirect。
    throw new Error("jsbin engine P0-P2 未实现:见 engine/README.md 阶段规划");
}

// jsbin_function(argNames, body) -> 可调用函数(new Function 语义)。
// 编译 `function(argNames){ body }` 片段,缓存编译结果(同体复用)。
export function jsbinFunction(argNames, body) {
    // TODO(P4):合成函数体源码,走 jsbinEval 的片段编译,返回宿主可调用闭包。
    throw new Error("jsbin engine new Function 未实现:见 engine/README.md 阶段规划");
}

// jsbin_import(runtimeSpecifier) -> Promise<namespace>
// 运行时 specifier 的动态 import(静态 specifier 已在主编译器 AOT 完成,非本引擎)。
export function jsbinImport(specifier) {
    // TODO(P4):运行时解析 + 编译目标模块成片段 + 载入模块表 + resolved Promise。
    throw new Error("jsbin engine 运行时 import() 未实现:见 engine/README.md 阶段规划");
}

export { execCode };
