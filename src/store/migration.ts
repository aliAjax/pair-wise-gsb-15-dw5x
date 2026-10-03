import type {Instance,MigrationBatch,MigrationItem,Workflow} from '../types';
// localStorage 模拟服务端: 跨窗口共享迁移令牌、已迁移版本与批次记录, 刷新或重开窗口后可恢复
const KEY='flowdesk.migration.v1';
export interface Server{tokens:Record<string,number>;versions:Record<string,number>;batches:MigrationBatch[]}
const empty=():Server=>({tokens:{},versions:{},batches:[]});
export const readServer=():Server=>{try{return{...empty(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return empty()}};
export const writeServer=(s:Server)=>{try{localStorage.setItem(KEY,JSON.stringify(s))}catch{/* 存储不可用时静默降级 */}};
export const loadBatches=():MigrationBatch[]=>readServer().batches;
const lastExecuted=(i:Instance)=>[...i.timeline].reverse().find(t=>t.status==='completed'||t.status==='current');
// 旧实例没有版本号: 按最后一条已执行节点回填到最早包含该节点的版本, 找不到返回 null
export const resolveVersion=(i:Instance,w:Workflow):number|null=>{if(i.version!=null)return i.version;const last=lastExecuted(i);if(!last)return null;const hits=w.versions.filter(v=>v.nodes.some(n=>n.data.label===last.title)).map(v=>v.version);return hits.length?Math.min(...hits):null};
const enteredApproval=(i:Instance,w:Workflow)=>{const labels=w.nodes.filter(n=>n.type==='approval').map(n=>n.data.label);return labels.includes(i.currentNode)||i.timeline.some(t=>labels.includes(t.title)&&(t.status==='completed'||t.status==='current'))};
const finished=(i:Instance)=>i.status==='completed'||i.timeline.some(t=>t.title==='结束'&&t.status==='completed');
// 生成批次: 冻结每个实例的来源版本, 仅仍停在旧版且未进入人工审批的实例可迁移, 其余保留原时间线
export const planBatch=(w:Workflow,instances:Instance[],seq:number,server:Server,backfilled:Set<string>):MigrationBatch=>{
 const items:MigrationItem[]=instances.filter(i=>i.workflowId===w.id).map(i=>{
  const base={instanceId:i.id,targetVersion:w.version,token:server.tokens[i.id]??0};
  const v=resolveVersion(i,w);
  if(finished(i))return{...base,sourceVersion:v,status:'skipped' as const,reason:'已结束，保留原时间线'};
  if(enteredApproval(i,w))return{...base,sourceVersion:v,status:'skipped' as const,reason:'已进入人工审批，保留原时间线'};
  if(v==null)return{...base,sourceVersion:null,status:'unresolved' as const,reason:'无版本号且按最后执行节点回填失败'};
  if(v>=w.version)return{...base,sourceVersion:v,status:'skipped' as const,reason:'已是最新版本'};
  return{...base,sourceVersion:v,status:'pending' as const,reason:backfilled.has(i.id)?`按最后执行节点回填为 v${v}`:'待迁移'};
 });
 return{id:`MB-${String(seq).padStart(3,'0')}`,workflowId:w.id,createdAt:'2026-07-11 16:45',targetVersion:w.version,attempts:0,items};
};
// 迁移写入: 更新实际执行版本并追加一次时间线(幂等, 重试不会重复追加)
const applyMigration=(i:Instance,version:number):Instance=>{const title=`版本迁移 → v${version}`;return{...i,version,timeline:i.timeline.some(t=>t.title===title)?i.timeline:[...i.timeline,{title,time:'16:50',status:'migrated'}]}};
// 提交/重试批次: 乐观令牌保证两个窗口同时提交同一实例时只允许一个写入; 写入失败保留待办, 重试只补未完成实例
export const runBatch=(batch:MigrationBatch,instances:Instance[],simulateFailure:boolean,server:Server)=>{
 const tokens={...server.tokens},versions={...server.versions},touched=new Map<string,Instance>();
 let migrated=0,conflict=0,writes=0,broken=false;
 const items=batch.items.map(it=>{
  if(it.status==='migrated'||it.status==='skipped'||it.status==='unresolved')return it;
  if(broken)return it; // 写入中断: 其余实例保持待办
  const inst=touched.get(it.instanceId)??instances.find(x=>x.id===it.instanceId);
  if(!inst)return{...it,status:'failed' as const,reason:'实例不存在'};
  const sv=versions[it.instanceId];
  if(it.status!=='pending'&&sv!=null&&sv>=it.targetVersion){ // 重试时目标版本已被其他提交写入: 本地补齐, 不重复追加时间线
   touched.set(it.instanceId,applyMigration(inst,sv));migrated++;
   return{...it,status:'migrated' as const,reason:'已迁移（其他提交已写入）'};
  }
  if((tokens[it.instanceId]??0)!==it.token){conflict++;return{...it,status:'conflict' as const,reason:'版本冲突：其他窗口已提交，保留待办'}};
  if(simulateFailure&&writes>0){broken=true;return{...it,status:'failed' as const,reason:'批次写入失败，保留待办'}};
  versions[it.instanceId]=it.targetVersion;tokens[it.instanceId]=it.token+1;writes++;migrated++;
  touched.set(it.instanceId,applyMigration(inst,it.targetVersion));
  return{...it,status:'migrated' as const,reason:`已迁移至 v${it.targetVersion}`};
 });
 return{instances:instances.map(i=>touched.get(i.id)??i),batch:{...batch,attempts:batch.attempts+1,items},tokens,versions,stats:{migrated,conflict,broken}};
};
