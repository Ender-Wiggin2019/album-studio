# ADR 0007：有序的项目保存会话

- 状态：已接受
- 日期：2026-08-16

## 决策

共享 Studio 使用一个项目保存会话统一处理自动保存、返回首页、导出前保存和关闭前保存。UI 只提交 Album Command，并在需要数据确定落盘时调用 `flush()`；不直接切换 saving/saved/error，也不直接调用平台保存。

保存会话拥有：

- 最新 Album Document revision；
- 650 ms debounce 与连续编辑 coalescing；
- 单一有序保存队列；
- 旧 revision 成功或失败的归属判断；
- 当前失败的重试与可观察保存状态。

Electron 和浏览器继续通过 `StudioPlatform.projects.save` 提供可替换的本地持久化 adapter。平台 adapter 不负责共享编辑会话的并发语义。

## 原因与后果

此前自动保存、返回、导出和关闭各自编排保存；Electron repository 自带队列而浏览器 OPFS 直接写入，导致 shared Studio 的正确性依赖隐藏的平台时序。会话 module 删除后，这些规则会重新散回多个调用点，因此它提供了真实 depth，而不是只增加一层转发。

连续修改会只自动保存最新快照；如果保存过程中产生新 revision，当前队列会继续写入新版本。过期请求的失败不会覆盖较新版本的成功状态。return/export/close 的 `flush()` 会等待最终 revision；相应行为可用延迟或失败的内存 adapter 快速测试。
