# M4-020b：修复 M4-020 的「人生方格」实施报告

状态：已实现并通过单元、端到端与 `pnpm verify`；本地提交在 `task/M4-020b-life-grid`，未推送。

## 问题与修复

M4-020 的方格几乎全是 `decision`：每个生日都会由后台结算一条年度重点 `decision.made`，而方格优先级把 `decision` 放在第 2 位；M3-042 之后占多数的 `life.<原型>` 日常事件又被 `factCategory` 归到 `other`，所以整张图几乎没有区别。

本次只改 `apps/web`（及其测试）与本文档：

1. **后台决定不着色**：`apps/web/src/components/fact-category.ts` 新增 `isBackgroundDecision(fact)`，只认 `type === 'decision.made' && details.decision === EVENT.yearlyFocus`（`choice.yearly-focus`）。`buildLifeGrid` 在归类时跳过这类事实；时间线仍照常显示它们，图标仍是决定。判断只有一个函数、一处使用，并由 `fact-category.test.ts` 锁定。
2. **新增 `daily`（日常 / Daily life）**：类型集合由 `@lifesim/systems` 的 `lifeEventCatalog()` + `lifeEventType()` 派生，没有手写类型表。`factCategory` 先识别主角生死与家人，再落到 `daily`；时间线图标与方格共用同一类别。新增原创杯形图标（`FactIcon.tsx`），并新增 `--color-daily` / `--color-daily-ink` 令牌（浅色与深色两套，`tokens.test.ts` 增加对比度断言）。
3. **优先级**：`life > decision > education > career > health > family > history > daily > finance > other`。`daily` 按要求排在 education / career / health / family / history / decision 之后、`other` 之前；它排在 `finance` 之前，因为「年度收支」是背景结算，日常经历更能代表那一年（若改为 finance 在前，成年年份几乎都会变成 finance）。图例由 `GRID_CATEGORIES` 从优先级派生，顺序与着色一致。
4. **图例文案**：`cohort.grid.decision` 中英改为「人生决定 / Life decisions」，新增「日常 / Daily life」。
5. **窄屏每行 ≤ 10 格**：`.life-grid` 改为固定 `repeat(10, minmax(0, 1fr))`，`max-width: 420px`。320px 与 390px 下都不会超过 10 格，也不会横向滚动。
6. **只显示已揭示的内容**：新增 `revealedGridInput({ facts, visibleCount, revealDate })`，方格只取时间线的 `visibleCount` 条事实、当前年份取揭示日期，死亡格只在 `life.death` 已揭示时出现。「同一秒出生的四人」也改为推进到揭示日期（`view.date`），而不是权威时钟，因此播放动画时不会提前显示下一年的状态或去世。

## 真实人生验证

用 `GameSession.create({ seed: 'probe-0', region: 'JP', year: 1978 })` 推进到 45 岁（出生 1978-08-25，时钟 2023-08-25，46 格），按新逻辑统计：

```
life:1 daily:25 education:4 decision:6 history:3 family:4 finance:1 career:2
```

逐格：`1978:life 1979:daily 1980:daily 1981:daily 1982:daily 1983:daily 1984:education 1985:daily 1986:daily 1987:decision 1988:daily 1989:decision 1990:education 1991:history 1992:family 1993:education 1994:decision 1995:decision 1996:daily 1997:education 1998:daily 1999:family 2000:family 2001:daily 2002:daily 2003:daily 2004:decision 2005:daily 2006:finance 2007:daily 2008:history 2009:history 2010:daily 2011:daily 2012:daily 2013:decision 2014:daily 2015:family 2016:daily 2017:career 2018:career 2019:daily 2020:daily 2021:daily 2022:daily 2023:daily`。

同一局面在修复前 46 格里绝大部份是 decision；修复后 8 种有颜色的类别、daily 25 格。`probe-0` 的年度重点事实每个生日一条，全部被方格忽略。

## 新增与修改的测试

- `apps/web/src/components/fact-category.test.ts`（新文件，3 项）：
  - 目录里每个 `lifeEventType(prototype.id)` 都归为 `daily`；
  - `life.birth` / `life.death` 仍是 `life`，其他 `life.*` 不会误判为 daily；
  - 只有 `choice.yearly-focus` 的 `decision.made` 是后台决定，时间线类别仍是 `decision`。
- `apps/web/src/game/life-grid.test.ts`（3 项原有 + 3 项新增）：
  - 后台年度重点 + 日常同年的格子是 `daily`；只有 yearly-focus + finance 的年份是 `finance`；非后台决定 + 日常是 `decision`；
  - `revealedGridInput` 只暴露已揭示事实与已揭示的死亡格，未揭示的财务事实不会着色；
  - 真实 JP 1978 `probe-0` 推进到 40 岁以上：至少 4 种类别、含 daily、没有任何格子因年度重点变成 decision、每个 decision 格都确有非后台决定。
- `apps/web/e2e/cohort.spec.ts` 新增 1 个测试（桌面与手机各跑一次）：推进到 20 岁，断言方格至少 4 种非空类别且含 daily、decision 图例中文「人生决定」/「日常」与英文「Life decisions」/「Daily life」正确、390px 与 320px 下每行 ≤ 10 格且无横向滚动。既有 6 个 cohort 测试未改断言。

## 实际运行的命令与输出

- 改动前 `pnpm verify`：`Test Files 91 passed (91)`，`Tests 838 passed (838)`，测试基线 `838 项（基线 ≥ 150），91 个文件，无跳过`，构建通过。
- `pnpm exec vitest run apps/web`：`Test Files 20 passed (20)`，`Tests 148 passed (148)`。
- `PW_CHANNEL=chrome pnpm --filter @lifesim/web exec playwright test e2e/cohort.spec.ts`：`14 passed (11.9s)`（7 个测试 × desktop/mobile）。
- `pnpm verify`：`Test Files 92 passed (92)`，`Tests 844 passed (844)`，测试基线 `844 项（基线 ≥ 150），92 个文件，无跳过`；格式、lint、边界、许可、来源、数据覆盖、类型检查与构建全部通过。
- `PW_CHANNEL=chrome pnpm test:e2e`：`130 passed (58.8s)`（desktop 与 mobile 两个项目；提交后重跑同结果）。

## 与任务规格的偏差

- 任务只要求 e2e 在 390px 与 320px 检查行宽；测试同时断言无横向滚动，属于加强，不是放宽。
- 每日/财务的先后：任务只写了 daily 在 decision 等之后、other 之前，没有写它与 finance 的相对顺序。这里把 daily 放在 finance 之前，理由见上；改动只需调整 `CATEGORY_PRIORITY` 一行。
- 「只显示已揭示内容」按 `visibleCount` + 揭示日期实现。播放动画时方格年份跟随揭示日期，因此 8 月出生者的新日历年会在一轮揭示约 36% 处出现，颜色随已揭示事实逐步补齐；四人也在揭示完成时追到权威时钟。若维护者期望「整年揭示完才出现新格」，只需把 `revealedGridInput` 的 `currentYear` 改为按最后一条已揭示事实取年份。

## 剩余风险

- 时间线的揭示按事实条数、日期按年进度插值，两者在生日附近天然不完全同步；方格选择了以揭示日期为准的年份，颜色可能在同一轮动画中从 `none` 变为 `daily` 再升级为更高优先级类别。这是「不提前显示完整颜色」的代价，不是错误。
- 「同一秒出生的四人」每一次动画帧都会尝试推进到揭示日期；本机测得四个成员推进一年在一次性与逐日分片下分别约 2.16 ms / 2.20 ms（Node 24.21.0），开销可忽略，但这不是 M4-020 的 16 ms 门禁口径，不能当作该门禁通过。
- `factCategory` 对年度重点仍返回 `decision`（时间线需要），只有方格用 `isBackgroundDecision` 排除；其他未来调用方若要「后台决定不算决定」，也要复用这个函数。
- 图例/方格颜色依赖新增的 `--color-daily` 令牌；只改了浅色与深色两套，没有引入第三方素材。

## 后续（只报告，不在本任务修）

1. 面板里四人的计算一旦出错会让整页白屏（没有错误边界）。
2. 首次打开需要联网下载五国数据，离线不可用。
3. 生存曲线没有标出情景段与缺数据段，也没有坐标轴标题。
4. 首次追赶在主线程同步运行，缺 16 ms 的实测报告。
5. `docs/tasks/M4-020.md` 与 `INDEX.md` 的状态没有更新。
