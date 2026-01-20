#!/usr/bin/env node
// JSBin 命令行编译工具

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { Compiler } from "./compiler/index.js";
import { detectPlatform, resolveTarget, listTargets } from "./compiler/core/platform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
    console.log(`
JSBin Compiler - JavaScript to Native

Usage:
  jsbin <input.js> [options]

Options:
  -o, --output <file>   Output file path (default: input basename + target)
  --os <os>             Target OS: linux, macos, windows
  --arch <arch>         Target architecture: arm64, x64
  --target <target>     Target platform (e.g., macos-arm64, linux-x64)
  --shared              Build shared library (.dylib/.so/.dll)
  --static              Build static library (.a/.lib)
  --no-jslib            Don't generate .jslib declaration file
  --export <name>       Export symbol (can be used multiple times)
  --lib <name>          Link with library
  --lib-path <path>     Add library search path
  --list-targets        List all supported targets
  --debug               Enable debug output
  -h, --help            Show this help

Examples:
  jsbin hello.js                              # Compile for current platform
  jsbin hello.js -o hello                     # Custom output name
  jsbin hello.js --os linux --arch x64        # Cross-compile to Linux x64
  jsbin hello.js --target macos-arm64         # Cross-compile to macOS ARM64
  jsbin mylib.js --shared -o libmy.dylib      # Build shared library
  jsbin mylib.js --static -o libmy.a          # Build static library
  jsbin app.js --lib mylib --lib-path ./libs  # Link with library
`);
}

function parseArgs(args) {
    const result = {
        input: null,
        output: null,
        os: null,
        arch: null,
        target: null,
        help: false,
        listTargets: false,
        debug: false,
        shared: false,
        static: false,
        noJslib: false,
        exports: [],
        libs: [],
        libPaths: [],
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        if (arg === "-h" || arg === "--help") {
            result.help = true;
        } else if (arg === "--list-targets") {
            result.listTargets = true;
        } else if (arg === "--debug") {
            result.debug = true;
        } else if (arg === "--shared") {
            result.shared = true;
        } else if (arg === "--static") {
            result.static = true;
        } else if (arg === "--no-jslib") {
            result.noJslib = true;
        } else if (arg === "-o" || arg === "--output") {
            i++;
            result.output = args[i];
        } else if (arg === "--os") {
            i++;
            result.os = args[i];
        } else if (arg === "--arch") {
            i++;
            result.arch = args[i];
        } else if (arg === "-t" || arg === "--target") {
            i++;
            result.target = args[i];
        } else if (arg === "--export") {
            i++;
            result.exports.push(args[i]);
        } else if (arg === "--lib" || arg === "-l") {
            i++;
            result.libs.push(args[i]);
        } else if (arg === "--lib-path" || arg === "-L") {
            i++;
            result.libPaths.push(args[i]);
        } else if (!arg.startsWith("-")) {
            result.input = arg;
        } else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        }
        i++;
    }

    return result;
}

function main() {
    const args = process.argv.slice(2);
    const opts = parseArgs(args);

    if (opts.help) {
        printUsage();
        process.exit(0);
    }

    if (opts.listTargets) {
        console.log("Supported targets:");
        for (const target of listTargets()) {
            console.log(`  ${target}`);
        }
        process.exit(0);
    }

    if (!opts.input) {
        console.error("Error: No input file specified");
        printUsage();
        process.exit(1);
    }

    // 解析输入文件路径（支持相对路径）
    const inputFile = path.resolve(process.cwd(), opts.input);

    if (!fs.existsSync(inputFile)) {
        console.error(`Error: Input file not found: ${inputFile}`);
        process.exit(1);
    }

    // 确定目标平台
    let target;
    if (opts.target) {
        target = opts.target;
    } else if (opts.os && opts.arch) {
        target = `${opts.os}-${opts.arch}`;
    } else if (opts.os || opts.arch) {
        const detected = detectPlatform();
        const [detectedOs, detectedArch] = detected.split("-");
        target = `${opts.os || detectedOs}-${opts.arch || detectedArch}`;
    } else {
        target = detectPlatform();
    }

    // 验证目标
    try {
        resolveTarget(target);
    } catch (e) {
        console.error(`Error: ${e.message}`);
        console.log("Use --list-targets to see supported targets");
        process.exit(1);
    }

    // 确定输出文件名
    let output = opts.output;
    if (!output) {
        // 默认输出文件名：去掉 .js 后缀，使用输入文件的目录
        const inputDir = path.dirname(inputFile);
        const inputBase = path.basename(inputFile, ".js");

        // 根据输出类型添加适当的后缀
        if (opts.shared) {
            const ext = target.startsWith("macos") ? ".dylib" : target.startsWith("windows") ? ".dll" : ".so";
            output = path.join(inputDir, `lib${inputBase}${ext}`);
        } else if (opts.static) {
            const ext = target.startsWith("windows") ? ".lib" : ".a";
            output = path.join(inputDir, `lib${inputBase}${ext}`);
        } else {
            output = path.join(inputDir, `${inputBase}-${target}`);
        }
    } else {
        // 解析输出路径
        output = path.resolve(process.cwd(), output);
    }

    // 添加 Windows 的 .exe 后缀（仅可执行文件）
    if (!opts.shared && !opts.static && target.includes("windows") && !output.endsWith(".exe")) {
        output += ".exe";
    }

    // 确定输出类型描述
    let outputTypeDesc = "executable";
    if (opts.shared) outputTypeDesc = "shared library";
    if (opts.static) outputTypeDesc = "static library";

    console.log(`Compiling ${inputFile} -> ${output} (${target}, ${outputTypeDesc})`);

    try {
        const compiler = new Compiler(target);

        // 设置源文件路径（用于解析相对路径的 jslib）
        compiler.setSourcePath(inputFile);

        // 设置编译选项
        if (opts.shared) {
            compiler.setOutputType("shared");
        } else if (opts.static) {
            compiler.setOutputType("static");
        }

        // 设置 jslib 生成选项
        if (opts.noJslib) {
            compiler.setOption("noJslib", true);
        }

        // 添加导出符号
        for (const exp of opts.exports) {
            compiler.addExport(exp);
        }

        // 添加库链接
        for (const lib of opts.libs) {
            compiler.addLibrary(lib);
        }

        // 添加库搜索路径
        for (const libPath of opts.libPaths) {
            compiler.addLibraryPath(libPath);
        }

        compiler.compileFile(inputFile, output);
        console.log(`Successfully compiled: ${output}`);
    } catch (e) {
        console.error(`Compilation error: ${e.message}`);
        if (opts.debug || process.env.DEBUG) {
            console.error(e.stack);
        }
        process.exit(1);
    }
}

main();
