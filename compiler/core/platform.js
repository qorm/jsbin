// JSBin 平台配置和检测
// 支持的目标平台定义

export const TARGETS = {
    // macOS
    "macos-arm64": { os: "macos", arch: "arm64", ext: "", dylibExt: ".dylib", desc: "macOS ARM64 (Apple Silicon)" },
    "macos-x64": { os: "macos", arch: "x64", ext: "", dylibExt: ".dylib", desc: "macOS x86_64" },
    "darwin-arm64": { os: "macos", arch: "arm64", ext: "", dylibExt: ".dylib", desc: "macOS ARM64", alias: "macos-arm64" },
    "darwin-amd64": { os: "macos", arch: "x64", ext: "", dylibExt: ".dylib", desc: "macOS x86_64", alias: "macos-x64" },
    "macos-amd64": { os: "macos", arch: "x64", ext: "", dylibExt: ".dylib", desc: "macOS x86_64", alias: "macos-x64" },

    // Linux
    "linux-arm64": { os: "linux", arch: "arm64", ext: "", dylibExt: ".so", desc: "Linux ARM64" },
    "linux-x64": { os: "linux", arch: "x64", ext: "", dylibExt: ".so", desc: "Linux x86_64" },
    "linux-amd64": { os: "linux", arch: "x64", ext: "", dylibExt: ".so", desc: "Linux x86_64", alias: "linux-x64" },
    "linux-aarch64": { os: "linux", arch: "arm64", ext: "", dylibExt: ".so", desc: "Linux ARM64", alias: "linux-arm64" },

    // Windows
    "windows-arm64": { os: "windows", arch: "arm64", ext: ".exe", dylibExt: ".dll", desc: "Windows ARM64" },
    "windows-x64": { os: "windows", arch: "x64", ext: ".exe", dylibExt: ".dll", desc: "Windows x86_64" },
    "windows-amd64": { os: "windows", arch: "x64", ext: ".exe", dylibExt: ".dll", desc: "Windows x86_64", alias: "windows-x64" },
};

// 检测当前平台
export function detectPlatform() {
    let platform = process.platform;
    let arch = process.arch;

    if (platform === "linux") {
        if (arch === "arm64" || arch === "aarch64") {
            return "linux-arm64";
        } else {
            return "linux-x64";
        }
    } else if (platform === "darwin") {
        if (arch === "arm64") {
            return "macos-arm64";
        } else {
            return "macos-x64";
        }
    } else if (platform === "win32") {
        if (arch === "arm64") {
            return "windows-arm64";
        } else {
            return "windows-x64";
        }
    }

    return "linux-x64"; // 默认
}

// 获取目标平台的 OS
export function getTargetOS(target) {
    let info = TARGETS[target];
    if (!info) return null;
    if (info.alias) {
        info = TARGETS[info.alias];
    }
    return info.os;
}

// 获取目标平台的架构
export function getTargetArch(target) {
    let info = TARGETS[target];
    if (!info) return null;
    if (info.alias) {
        info = TARGETS[info.alias];
    }
    return info.arch;
}

// 获取目标平台信息
export function getTargetInfo(targetPlatform) {
    let info = TARGETS[targetPlatform];
    if (!info) {
        return null;
    }
    let resolved = info.alias ? TARGETS[info.alias] : info;
    return {
        name: info.alias || targetPlatform,
        os: resolved.os,
        arch: resolved.arch,
        ext: resolved.ext,
        dylibExt: resolved.dylibExt,
        desc: resolved.desc,
        isAlias: !!info.alias,
    };
}

// 获取真实目标名（解析别名）
export function resolveTarget(targetPlatform) {
    let info = TARGETS[targetPlatform];
    if (!info) {
        return null;
    }
    return info.alias || targetPlatform;
}

// 列出所有非别名目标
export function listTargets() {
    let result = [];
    for (let name in TARGETS) {
        let info = TARGETS[name];
        if (!info.alias) {
            result.push({
                name: name,
                os: info.os,
                arch: info.arch,
                desc: info.desc,
            });
        }
    }
    return result;
}

// 获取当前平台对应的系统调用号
export function getSyscallNumbers(target) {
    let info = getTargetInfo(target);
    if (!info) return null;

    let os = info.os;
    let arch = info.arch;

    // 系统调用号表
    const syscalls = {
        "linux-x64": {
            read: 0,
            write: 1,
            open: 2,
            close: 3,
            mmap: 9,
            munmap: 11,
            brk: 12,
            exit: 60,
            exit_group: 231,
        },
        "linux-arm64": {
            read: 63,
            write: 64,
            openat: 56,
            close: 57,
            mmap: 222,
            munmap: 215,
            brk: 214,
            exit: 93,
            exit_group: 94,
        },
        "macos-x64": {
            read: 0x2000003,
            write: 0x2000004,
            open: 0x2000005,
            close: 0x2000006,
            mmap: 0x20000c5,
            munmap: 0x2000049,
            exit: 0x2000001,
        },
        "macos-arm64": {
            read: 3,
            write: 4,
            open: 5,
            close: 6,
            mmap: 197,
            munmap: 73,
            exit: 1,
        },
        "windows-x64": {
            // Windows 使用 NTDLL 而非直接系统调用
            NtWriteFile: 0x08,
            NtReadFile: 0x06,
            NtAllocateVirtualMemory: 0x18,
            NtFreeVirtualMemory: 0x1e,
            NtTerminateProcess: 0x2c,
        },
    };

    let key = os + "-" + arch;
    return syscalls[key] || null;
}

// 获取 mmap 标志
export function getMmapFlags(target) {
    let info = getTargetInfo(target);
    if (!info) return 0x22;

    // MAP_ANONYMOUS | MAP_PRIVATE
    return info.os === "linux" ? 0x22 : 0x1002;
}
