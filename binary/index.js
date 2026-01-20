// 二进制格式生成器
// 支持 ELF (Linux)、Mach-O (macOS)、PE (Windows)

// 基础类
export { BinaryGenerator, OutputType, pageAlign, align16, align } from "./binary_format.js";

// ELF (Linux)
export { ELF64Generator } from "./elf.js";
export { ELF64ARM64Generator } from "./elf_arm64.js";
// export { ELF64DynamicGenerator } from "./elf_dynamic.js";

// Mach-O (macOS)
export { MachOARM64Generator } from "./macho_arm64.js";
export { MachOX64Generator } from "./macho_x64.js";
export { MachODylibGenerator } from "./macho_dylib.js";

// PE (Windows)
// export { PEGenerator } from "./pe.js";
// export { PEDLLGenerator } from "./pe_dll.js";

// 动态库/静态库支持
export { DylibConfig, StaticLibConfig, LinkerConfig, SymbolResolver, ExportCollector, createDylibCompilerOptions, createStaticLibCompilerOptions } from "./dylib.js";
