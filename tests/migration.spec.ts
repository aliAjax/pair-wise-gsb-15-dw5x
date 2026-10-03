import {test,expect} from '@playwright/test';
test.describe.serial('版本迁移批次',()=>{
 test('生成批次: 冻结来源版本, 无版本号回填, 回填失败留待处理',async({page})=>{
  await page.goto('/monitor');
  await expect(page.getByTestId('migration-panel')).toBeVisible();
  await page.getByTestId('migration-workflow').selectOption({label:'采购合同审批 · 当前 v2'});
  await page.getByTestId('plan-migration').click();
  await expect(page.getByRole('status')).toContainText('3 个可迁移');
  const batch=page.getByTestId('migration-batch').first();
  await expect(batch).toContainText('MB-001');
  const row=(id:string)=>batch.getByTestId('migration-item').filter({hasText:id});
  await expect(row('INS-2026-0002')).toContainText('v1'); // 冻结来源版本
  await expect(row('INS-2026-0002')).toContainText('待迁移');
  await expect(row('INS-2026-0014')).toContainText('按最后执行节点回填为 v1'); // 无版本号回填
  await expect(row('INS-2026-0026')).toContainText('已进入人工审批'); // 保留原时间线
  await expect(row('INS-2026-0062')).toContainText('已结束');
  await expect(row('INS-2026-0050')).toContainText('已是最新版本');
  await expect(row('INS-2026-0038')).toContainText('待处理'); // 回填不了
  await expect(row('INS-2026-0038')).toContainText('—');
  // 监控详情显示实际执行版本(含回填结果)
  await page.getByTestId('instance-row').filter({hasText:'INS-2026-0014'}).click();
  await expect(page.getByTestId('instance-version')).toHaveText('v1');
  await page.locator('.instance-drawer .icon-btn').click();
  await page.getByTestId('instance-row').filter({hasText:'INS-2026-0038'}).click();
  await expect(page.getByTestId('instance-version')).toHaveText('未知');
 });
 test('提交批次: 仅旧版未审批实例迁移, 时间线只追加一次',async({page})=>{
  await page.goto('/monitor');
  await page.getByTestId('plan-migration').click();
  await page.getByTestId('submit-migration').click();
  await expect(page.getByRole('status')).toContainText('3 个实例已迁移');
  const batch=page.getByTestId('migration-batch').first();
  await expect(batch.getByTestId('migration-item').filter({hasText:'已迁移'})).toHaveCount(3);
  await batch.getByTestId('migration-item').filter({hasText:'INS-2026-0002'}).getByRole('button').click();
  await expect(page.getByTestId('instance-version')).toHaveText('v2'); // 实际执行版本已切换
  await expect(page.getByTestId('execution-timeline').getByText('版本迁移 → v2')).toHaveCount(1);
  await page.locator('.instance-drawer .icon-btn').click();
  await page.getByTestId('instance-row').filter({hasText:'INS-2026-0026'}).click(); // 进入审批的实例保留原时间线
  await expect(page.getByTestId('instance-version')).toHaveText('v1');
  await expect(page.getByTestId('execution-timeline')).not.toContainText('版本迁移');
 });
 test('写入失败保留待办, 重试只补未完成实例且不重复追加时间线',async({page})=>{
  await page.goto('/monitor');
  await page.getByTestId('sim-fail-toggle').check();
  await page.getByTestId('plan-migration').click();
  await page.getByTestId('submit-migration').click();
  await expect(page.getByRole('status')).toContainText('批次写入失败');
  const batch=page.getByTestId('migration-batch').first();
  await expect(batch.getByTestId('migration-item').filter({hasText:'已迁移'})).toHaveCount(1);
  await expect(batch.getByTestId('migration-item').filter({hasText:'写入失败'})).toHaveCount(1);
  await expect(batch.getByTestId('migration-item').filter({hasText:'待迁移'})).toHaveCount(1);
  await page.getByTestId('retry-migration').click();
  await expect(page.getByRole('status')).toContainText('重试补迁');
  await expect(batch.getByTestId('migration-item').filter({hasText:'已迁移'})).toHaveCount(3);
  await batch.getByTestId('migration-item').filter({hasText:'INS-2026-0002'}).getByRole('button').click();
  await expect(page.getByTestId('execution-timeline').getByText('版本迁移 → v2')).toHaveCount(1); // 首个实例未被重复追加
 });
 test('两个窗口同时提交同一实例: 只允许一个写入, 另一个版本冲突保留待办',async({context})=>{
  const p1=await context.newPage(),p2=await context.newPage();
  await p1.goto('/monitor');await p1.getByTestId('plan-migration').click();
  await p2.goto('/monitor');await p2.getByTestId('plan-migration').click(); // p2 加载到 p1 的批次, 再生成自己的批次
  await p1.getByTestId('submit-migration').click();
  await expect(p1.getByTestId('migration-batch').first().getByTestId('migration-item').filter({hasText:'已迁移'})).toHaveCount(3);
  const b2=p2.getByTestId('migration-batch').last();
  await b2.getByTestId('submit-migration').click();
  await expect(b2.getByTestId('migration-item').filter({hasText:'版本冲突'})).toHaveCount(3);
  await expect(b2).toContainText('保留待办');
  await b2.getByTestId('retry-migration').click(); // 冲突实例已被写入 → 补齐待办, 不重复追加时间线
  await expect(b2.getByTestId('migration-item').filter({hasText:'已迁移'})).toHaveCount(3);
  await b2.getByTestId('migration-item').filter({hasText:'INS-2026-0074'}).getByRole('button').click();
  await expect(p2.getByTestId('instance-version')).toHaveText('v2');
  await expect(p2.getByTestId('execution-timeline').getByText('版本迁移 → v2')).toHaveCount(1);
  await p1.close();await p2.close();
 });
 test('版本比较显示各版本的实际执行实例数',async({page})=>{
  await page.goto('/workflows/wf-2/versions');
  await expect(page.getByTestId('version-compare')).toBeVisible();
  await expect(page.getByTestId('version-exec-count')).toHaveCount(2);
  await expect(page.locator('.version-list')).toContainText('5 个实例实际执行'); // v1: 含回填与已结束实例
  await expect(page.locator('.version-list')).toContainText('1 个实例实际执行'); // v2
 });
});
