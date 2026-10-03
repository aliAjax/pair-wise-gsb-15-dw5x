import {test,expect} from '@playwright/test';
test.describe.serial('版本迁移批次',()=>{
 test('提交批次：冻结来源版本，仅迁移旧版且未进审批的实例',async({page})=>{
  await page.goto('/monitor');
  await expect(page.getByTestId('migration-panel')).toBeVisible();
  await page.getByLabel('迁移流程').selectOption({label:'供应商准入'});
  // 额外勾选一个已在当前版本和一个已结束的实例，验证保留原时间线
  await page.getByLabel('选择 INS-2026-0042').check();
  await page.getByLabel('选择 INS-2026-0054').check();
  await page.getByTestId('submit-batch').click();
  await expect(page.getByRole('status')).toContainText('批次');
  const batch=page.getByTestId('migration-batch').first();
  await expect(batch).toContainText('已迁移 2');
  await expect(batch).toContainText('待办 1');
  await expect(batch).toContainText('已跳过 2');
  // 停在旧版且未进审批：已迁移，来源版本提交时冻结
  const row6=batch.getByTestId('batch-item').filter({hasText:'INS-2026-0006'});
  await expect(row6).toContainText('v2（冻结）');
  await expect(row6).toContainText('已迁移');
  // 缺少版本号且无法回填：留在待处理
  const row18=batch.getByTestId('batch-item').filter({hasText:'INS-2026-0018'});
  await expect(row18).toContainText('未知');
  await expect(row18).toContainText('待处理');
  // 已结束 / 已在当前版本：保留原时间线
  await expect(batch.getByTestId('batch-item').filter({hasText:'INS-2026-0054'})).toContainText('已结束');
  await expect(batch.getByTestId('batch-item').filter({hasText:'INS-2026-0042'})).toContainText('已在当前版本');
  // 监控详情显示实际执行版本，时间线追加迁移记录
  await page.getByTestId('instance-row').filter({hasText:'INS-2026-0006'}).click();
  await expect(page.getByTestId('execution-version')).toHaveText('v3');
  await expect(page.getByTestId('execution-timeline')).toContainText('版本迁移至 v3');
 });
 test('两个窗口同时提交同一实例只允许一个写入',async({page,context})=>{
  await page.goto('/monitor');
  const page2=await context.newPage();
  await page2.goto('/monitor');
  // 窗口一提交，成功写入
  await page.getByLabel('迁移流程').selectOption({label:'供应商准入'});
  await page.getByTestId('submit-batch').click();
  await expect(page.getByTestId('migration-batch').first()).toContainText('已迁移 2');
  // 窗口二提交同一批实例：只允许一个写入，另一个保留待办并显示版本冲突
  await page2.getByLabel('迁移流程').selectOption({label:'供应商准入'});
  await page2.getByTestId('submit-batch').click();
  const batch2=page2.getByTestId('migration-batch').first();
  await expect(batch2.getByTestId('batch-item').filter({hasText:'INS-2026-0006'})).toContainText('版本冲突');
  await expect(batch2.getByTestId('batch-item').filter({hasText:'INS-2026-0030'})).toContainText('版本冲突');
  await expect(batch2).toContainText('待办 3');
  await page2.close();
 });
 test('批次写入失败后保留待办，重试只补未完成且不重复时间线',async({page})=>{
  await page.goto('/monitor');
  await page.getByLabel('模拟写入故障').check();
  await page.getByLabel('迁移流程').selectOption({label:'供应商准入'});
  await page.getByTestId('submit-batch').click();
  const batch=page.getByTestId('migration-batch').first();
  await expect(batch.getByTestId('batch-item').filter({hasText:'INS-2026-0006'})).toContainText('写入失败');
  await expect(batch).toContainText('待办 3');
  // 恢复后重试：只补未完成实例
  await page.getByLabel('模拟写入故障').uncheck();
  await page.getByTestId('retry-batch').click();
  await expect(batch.getByTestId('batch-item').filter({hasText:'INS-2026-0006'})).toContainText('已迁移');
  await expect(batch.getByTestId('batch-item').filter({hasText:'INS-2026-0018'})).toContainText('待处理');
  // 再次重试不重复追加时间线
  await page.getByTestId('retry-batch').click();
  await page.getByTestId('instance-row').filter({hasText:'INS-2026-0006'}).click();
  await expect(page.getByTestId('execution-version')).toHaveText('v3');
  await expect(page.getByTestId('execution-timeline').getByText('版本迁移至 v3')).toHaveCount(1);
 });
 test('无版本号旧实例按最后一条已执行节点回填',async({page})=>{
  await page.goto('/monitor');
  await page.getByLabel('迁移流程').selectOption({label:'差旅费用审批'});
  await page.getByLabel('选择 INS-2026-0025').check();
  await page.getByTestId('submit-batch').click();
  const row=page.getByTestId('migration-batch').first().getByTestId('batch-item').filter({hasText:'INS-2026-0025'});
  // 最后执行节点“高额通知”仅存在于 v2+，据此回填来源版本；已进入审批则保留原时间线
  await expect(row).toContainText('v2（回填）');
  await expect(row).toContainText('已进入人工审批');
 });
 test('版本比较显示实际执行版本',async({page})=>{
  await page.goto('/workflows/wf-6/versions');
  const stats=page.getByTestId('execution-version-stats');
  await expect(stats).toContainText('实际执行版本');
  await expect(stats).toContainText('v2：2 个');
  await expect(stats).toContainText('1 个实例缺少版本号');
 });
});
