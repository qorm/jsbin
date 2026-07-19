# asm.js 接管规划 (plan.md)

> 接管日期: 2026-07-19 · 基线: dev @ v1.5.52 (fixtures 362/362 全绿, gen1==gen2==gen3 字节级定点)
> 本文档是接管后的总执行蓝图,取代 ROADMAP 中已滞后的里程碑表,作为进度跟踪的唯一事实源。

---

## 0. 接管交接状态(2026-07-19 已完成)

| 事项 | 结果 |
|---|---|
| 前代 AI 助手痕迹清理 | ✅ `.claude/`(1.5GB, 60 worktree)已删;953 个提交的 `Co-Authored-By` 尾注已从全部历史剥离;100 个 `worktree-agent-*`/`worktree-wf_*` 分支已删;5 个 tag(v1.4.1–v1.4.5)附注重打;test262 摘要残留路径已修正 |
| 回滚保险 | `jsbin-backup-2026-07-19.bundle`(清理前全量引用快照) |
| 保留分支 | `dev`(主开发)、`main`(与 dev 同点)、`work`/`work2`/`tmp_fsrepro`(各有 1–3 个未合并提交,待甄别后并入或删除) |
| 验证 | 改写仅动提交信息,tree 逐字节不变;fixtures 362/362 通过 |
| 待办(已决议) | ~~远程 force-push 同步~~ → 改为**重新初始化**:仓库更名 `qorm/asm.js`(产品正式定名 asm.js,主页 https://asm.js.cn),历史重置为单提交 v0.1 重新编号(非回退),仅 `main`/`dev` 双分支,旧 v1.x tags/releases 全部退役;releases 说明文字已备份至 `.agent-work/releases-backup/` |

## 1. 项目理解(一句话)

零依赖、自举的 JavaScript→原生 AOT 编译器:JS 源码 →(lang 前端)→(compiler 上帝类直接 codegen)→(vm 虚拟指令 + 寄存器提升)→(backend 物理翻译)→(asm 编码/重定位)→(binary 五格式打包);运行时由 `runtime/*Generator` 在编译期现生成机器码;值表示为 NaN-boxing;分代 GC 默认开启;G-M-P 并行调度已到 N>2(仅 linux-arm64 真体)。

**当前阶段定位**: v1.5.x 修复季尾声 + G-M-P 一期收官的交汇点。ES/Node 从"补能力"转入"度量驱动收口"(test262 20.4% 是北极星数字);L2 引擎库(route B)已超前交付,L1 未启动;文档系统性滞后代码 10+ 个版本。

## 2. 治理铁律(每次改动必须遵守,源自 BOOTSTRAP_RULES §2/§3)

1. **fixtures 不降**: `node tests/run_fixtures.mjs` 不低于当前基线(362)。
2. **自举定点不破**: 任何改动后 macos-arm64 全链 `gen1==gen2==gen3` 字节一致;探针字节不变不构成安全证据。
3. **gen0 最小复现**: 每个修复配 repro,与 Node 行为对拍。
4. **内存布局原子性**: 对象头/数组头变更必须单次提交同步所有遍历站点。
5. **增量纪律**: 严禁复制大 codegen 方法(v1.5.52 布局悬崖教训:+341 行即触发 __text 非确定性),增量必须参数化去重。

## 3. 阶段规划与进度安排

### S0 — 接管收尾(07-19 → 07-25,本周)
- [x] 清理协助者标识 + 备份 + 基线验证
- [x] **文档一次性清偿**(2026-07-19 完成,8 文件): README(中英)test262/内建清单;ROADMAP v1.5.52 状态注 + 里程碑实际状态列;ES_SUPPORT 基线 v1.5.52/362;NODEJS_SUPPORT_ANALYSIS 高危表逐条核实;engine/README 矛盾消除;PERF_PLAN 状态注;tests/README 死引用修复
- [x] 游离测试资产处置: `ptest/` 与 `support/` 登记为本地 scratch(不入库、不进基线),tests/README 已记录;ENGINEERING_PLAN.md 死引用已修
- [x] 分支甄别(2026-07-19): `work`/`work2` 独有提交与 dev 补丁级等价,已删;`tmp_fsrepro` **保留**——含未并入的真实 `fs.statSync`/`readdirSync`/`renameSync`、`path.posix/win32` 与往返 fixture,是 S5(N3 收尾)的移植素材,届时人工移植到当代代码并过自举门禁
- [x] 远程同步 → 按主人决议改为**重新初始化**(2026-07-19): repo 更名 `qorm/asm.js`、单提交 v0.1 新历史、`main`/`dev` 双分支、旧 tags/releases 清场;`--version` 显示 `asm.js 0.1`
- **门禁**: fixtures 362/362;定点字节一致

### S1 — test262 快速杠杆(07-26 → 08-08)
- [~] 修复 TypedArray 区坏 include(**2026-07-19 根因已修**:根因是构造器从未物化为全局值,`ArrayBuffer.prototype.resize` 读 undefined 属性致 include 加载即抛;已实现构造器闭包 + `.prototype` 单例 + 动态方法分派,TA 区 0/288 → 10/288;**剩余缺口非 include 问题**:%TypedArray% 原型链、方法值读取、描述符反射——转入 S4 同类簇合并处理)
- [ ] SIGSEGV/SIGBUS 崩溃簇(458 项)聚类归因,修头部根因
- [ ] 目标: **20.4% → ≥28%**;报告更新到 tests/test262/last_report.md
- **门禁**: fixtures 不降 + 定点 + test262 数字只升

### S2 — 编译器车道清债(08-09 → 08-29)
每修一个即解锁一批 Node shim 缺口,优先于 shim 扩面:
- [ ] 6 参对象方法 call-ABI bug(解锁异步 pbkdf2/hkdf)
- [ ] 类体计算键 `[Symbol.asyncIterator]` 不被 for await 派发(C3,解锁 stream 异步迭代)
- [ ] 方法名派发劫持(`Buffer.concat`/`.indexOf` 类,C 族根因)
- [ ] C1/C2(类方法名 `end` 误编译、大模块 extends 布局崩)根因修复
- [ ] 静默退化转显式报错: 未知 bare import / `import https`
- **门禁**: 每项配 repro + fixtures + 定点

### S3 — G-M-P M6 收尾(08-30 → 09-19)
- [ ] channel 跨 M futex 唤醒(需动共享协程路径,最高风险项,独立分支推进)
- [ ] 分配压力自动触发 STW(从冒烟到实用的关键一跃)
- [ ] 非 M0 协调者选举
- [ ] x64 段寄存器 TLS 预研(解锁 x64 多 M,附带助攻 x64 自举定点阻塞项)
- **门禁**: GOMAXPROCS=1 定点逐字节不动;linux-arm64 Docker 冒烟 ×15 绿

### S4 — test262 二轮攻坚(09-20 → 10-10)
- [ ] parser 宽松性(negative-parse 429 + COMPILE_FAIL 601 同源,~1030 项)
- [ ] 内建属性描述符反射(528 项)
- [ ] async `$DONE` 族(535 项)
- [ ] 目标: **≥40%**;接入 CI 仪表盘化跟踪
- **门禁**: 同 S1

### S5 — Node 深水区 + 性能专项(10-11 →,按 S1–S4 实际进度顺延)
- [ ] N3 收尾: fs `statSync`/`readdirSync` 深度(需先解自举堆布局脆性)
- [ ] N4 启动: 20 个真实 npm 包验证集
- [ ] 字符串 O(N²) 拼接专项(PERF_PLAN 自封 #1,实测 ~206× vs node): rope 或可变累加缓冲,先出设计评审再动手
- [ ] **编译速度专项**(2026-07-19 实测立案): 出厂编译器自编译 25.5s vs node 1.55s(~16×)。瓶颈定位:时间均匀散布在编译器 JS 逻辑的属性访问/调用上,被运行时**属性访问 ~13×** 差距放大;已排除 GC/字符串拼接/调用次数(emit32 批量 push、macho 批量写出、GC-off 三项实测收益均 ~0,c3e20ba 已顺手提交)。真杠杆 = 属性访问/内联缓存性能(PERF_PLAN P3 完整 IR 线 + ARCH_OPTIMIZATION_SUGGESTIONS 支柱),先出设计评审再动手
- [ ] "定点迁移"机制设计: 受控打破 gen2==gen3 一步(双代过渡),偿还 existsSync 假阳性、`\0` 转义丢弃等被定点固化的正确性债
- [ ] **L1 决策点**: AOT 嵌入库是否仍是产品目标(地基 `binary/*_object.js`/`static_linker.js` 现成;L2 route B 已覆盖大部分需求)——S5 开始前给出 go/no-go
- [ ] **C 互操作跟进**(2026-07-19 主人指定): 设计已定稿 `docs/C_INTEROP_DESIGN.md`(①消费 C 动态库 ②消费 C 静态库 ③JS 产出库,C0–C6 阶段 + macOS arm64 实证基线,实证产物在 `.agent-work/c-interop-probe/`);**声明层已改决议**:废弃 .jslib,直接消费 C 头文件——见 `docs/C_HEADER_DECLARATION.md`(zlib 为首个验收靶);C0 修复排期与 L1 决策联动

## 4. 风险登记(持续跟踪)

| 风险 | 等级 | 对策 |
|---|---|---|
| 自举布局悬崖(源码体积/组合触发的静默 miscompile) | 高(**已实证活跃**,2026-07-19) | 本周期实测:`gen1==gen2==gen3` 在**同一源码**(含基线提交 e121c1a/b84f8e5)上随运行窗口翻 pass/fail——编译后编译器内堆布局运气(GC 保守扫描族),gen2==gen3 恒成立、gen0(node) 与 gen1+ 发射量发散(坏窗口差 ~240KB TDZ 守卫字符串)。**非本次改动引入**;铁律 2/5 照守,提交一律在验证窗口内完成并记录;根治列入 S5 专项(与 28GB 初始堆规避项同源) |
| 28GB 初始堆是重定位 bug 的规避而非修复 | 高 | S5 定点迁移机制落地后排期根治;<32GB 机器暂无法自举需在 README 声明 |
| x64 质量债(自举定点未达、TLS 未做) | 中 | S3 预研后专项 |
| 上帝类 Compiler(3.5k 行)+ mixin 隐式契约 | 中 | 触及模块解析时顺手拆 `compiler/modules/`,不做大重构 |
| TLS/https 整包自实现 | 低(已冻结) | 维持"不做",import 转显式报错(S2) |

## 5. 进度跟踪机制

- 每个阶段结束更新本文件勾选状态 + CHANGELOG 版本条目,版本号沿用 v1.5.x 递增。
- 每周日复盘: fixtures 数、test262 %、定点状态、阶段燃尽。
- 阶段未过门禁不进入下一阶段;阻塞超 3 天升级给主人决策。
