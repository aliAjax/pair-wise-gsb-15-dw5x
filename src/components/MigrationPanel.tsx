import {useMemo,useState} from 'react';
import {GitBranch,RotateCcw} from 'lucide-react';
import {Empty,Status} from './common';
import {useAppStore} from '../store/useAppStore';
import {evaluate,todoCount} from '../store/migration';

const STATE_VIEW:Record<string,[string,string]>={migrated:['已迁移','completed'],skipped:['已跳过','archived'],failed:['写入失败','abnormal'],conflict:['版本冲突','timeout'],pending:['待处理','draft']};

export function MigrationPanel(){
  const ws=useAppStore(s=>s.workflows),ins=useAppStore(s=>s.instances),batches=useAppStore(s=>s.batches);
  const simulateFailure=useAppStore(s=>s.simulateFailure),setSimulateFailure=useAppStore(s=>s.setSimulateFailure);
  const submitBatch=useAppStore(s=>s.submitBatch),retryBatch=useAppStore(s=>s.retryBatch);
  const firstWf=useMemo(()=>ws.find(w=>ins.some(i=>i.workflowId===w.id&&evaluate(w,i).migratable))?.id??ws[0]?.id??'',[ws,ins]);
  const [wfId,setWfId]=useState(firstWf),[checked,setChecked]=useState<string[]|null>(null);
  const w=ws.find(x=>x.id===wfId)??ws[0];
  const candidates=useMemo(()=>w?ins.filter(i=>i.workflowId===w.id).map(i=>({inst:i,ev:evaluate(w,i)})):[],[ins,w]);
  const selected=checked??candidates.filter(c=>c.ev.migratable).map(c=>c.inst.id);
  const toggle=(id:string)=>setChecked(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  if(!w)return null;
  const submit=()=>{submitBatch(w.id,selected);setChecked(null)};
  return <section className="panel migration-panel" data-testid="migration-panel">
    <div className="panel-head"><div><h2>版本迁移批次</h2><p>提交时冻结来源版本，仅迁移仍停在旧版且未进入人工审批的实例，失败可重试</p></div><label className="simulate-toggle"><input type="checkbox" checked={simulateFailure} onChange={e=>setSimulateFailure(e.target.checked)}/>模拟写入故障</label></div>
    <div className="migration-builder">
      <select aria-label="迁移流程" value={w.id} onChange={e=>{setWfId(e.target.value);setChecked(null)}}>{ws.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <span className="target-version">目标版本 <b>v{w.version}</b></span>
      <span className="spacer"/>
      <button data-testid="submit-batch" disabled={!selected.length} onClick={submit}>提交迁移批次（{selected.length}）</button>
    </div>
    <table className="candidate-table">
      <thead><tr><th></th><th>实例编号</th><th>申请人</th><th>状态</th><th>当前节点</th><th>执行版本</th><th>迁移评估</th></tr></thead>
      <tbody>{candidates.map(({inst,ev})=><tr key={inst.id} data-testid="candidate-row">
        <td><input type="checkbox" aria-label={`选择 ${inst.id}`} checked={selected.includes(inst.id)} onChange={()=>toggle(inst.id)}/></td>
        <td><b>{inst.id}</b></td><td>{inst.applicant}</td><td><Status value={inst.status}/></td><td>{inst.currentNode}</td>
        <td>{inst.version?`v${inst.version}`:'未知'}</td>
        <td className={ev.migratable?'hint-ok':'hint-no'}>{ev.hint}</td>
      </tr>)}</tbody>
    </table>
    {batches.length===0&&<Empty title="暂无迁移批次" text="勾选候选实例并提交，生成可恢复的迁移批次"/>}
    {batches.map(b=>{
      const wf=ws.find(x=>x.id===b.workflowId),todo=todoCount(b.items),mig=b.items.filter(i=>i.state==='migrated').length,skip=b.items.filter(i=>i.state==='skipped').length;
      return <article className="batch-card" data-testid="migration-batch" key={b.id}>
        <div className="batch-head"><GitBranch/><b>{b.id}</b><span>{wf?.name} → v{b.targetVersion}</span><small>{b.createdAt}</small><span className="batch-summary">已迁移 {mig} · 待办 {todo} · 已跳过 {skip}</span>{todo>0&&<button className="secondary mini" data-testid="retry-batch" onClick={()=>retryBatch(b.id)}><RotateCcw/>重试待办</button>}</div>
        <table>
          <thead><tr><th>实例编号</th><th>来源版本</th><th>状态</th><th>说明</th></tr></thead>
          <tbody>{b.items.map(it=>{const[label,cls]=STATE_VIEW[it.state];return <tr key={it.instanceId} data-testid="batch-item">
            <td><b>{it.instanceId}</b></td>
            <td>{it.sourceVersion==null?'未知':`v${it.sourceVersion}${it.backfilled?'（回填）':'（冻结）'}`}</td>
            <td><span className={'status '+cls}>{label}</span></td>
            <td>{it.reason||'—'}</td>
          </tr>})}</tbody>
        </table>
      </article>})}
  </section>;
}
