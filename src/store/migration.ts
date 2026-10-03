import type {Instance,MigrationBatch,MigrationItem,Workflow} from '../types';

export const CLAIM_KEY='flowdesk-migration-claims';
export const BATCH_TIME='2026-07-11 17:20';

/** 跨窗口写入锁：instanceId -> 已写入该实例的批次 id */
export const readClaims=():Record<string,string>=>{try{return JSON.parse(localStorage.getItem(CLAIM_KEY)||'{}')}catch{return{}}};
const writeClaim=(instanceId:string,batchId:string)=>{const c=readClaims();c[instanceId]=batchId;localStorage.setItem(CLAIM_KEY,JSON.stringify(c))};

/** 实例是否已进入人工审批（任一审批节点已执行或正在执行） */
export const enteredApproval=(w:Workflow,inst:Instance):boolean=>{
  const labels=w.nodes.filter(n=>n.type==='approval').map(n=>n.data.label);
  return inst.timeline.some(t=>labels.includes(t.title)&&(t.status==='completed'||t.status==='current'));
};

/** 旧实例缺少版本号时，按最后一条已执行节点回填其来源版本；节点无法区分版本则返回 null */
export const backfillVersion=(w:Workflow,inst:Instance):number|null=>{
  const last=[...inst.timeline].reverse().find(t=>t.status==='completed'||t.status==='current');
  if(!last)return null;
  const hits=w.versions.filter(v=>v.nodes.some(n=>n.data.label===last.title)).map(v=>v.version);
  return hits.length>0&&hits.length<w.versions.length?Math.min(...hits):null;
};

/** 监控页候选评估：该实例能否迁往流程当前版本 */
export const evaluate=(w:Workflow,inst:Instance):{migratable:boolean;hint:string}=>{
  if(inst.status==='completed')return{migratable:false,hint:'已结束，保留原时间线'};
  if(enteredApproval(w,inst))return{migratable:false,hint:'已进入人工审批，保留原时间线'};
  const v=inst.version??backfillVersion(w,inst);
  if(v==null)return{migratable:true,hint:'缺少版本号，提交后尝试回填'};
  if(v>=w.version)return{migratable:false,hint:'已在当前版本'};
  return{migratable:true,hint:`v${v} → v${w.version} 可迁移`};
};

/** 幂等迁移：升级执行版本并追加时间线，已存在迁移记录则不重复追加 */
const migrate=(inst:Instance,target:number):Instance=>{
  const title=`版本迁移至 v${target}`;
  const dup=inst.timeline.some(t=>t.title===title);
  return{...inst,version:target,timeline:dup?inst.timeline:[...inst.timeline,{title,time:'17:20',status:'completed'}]};
};

/**
 * 逐条写入批次项：只补待办项（待处理/失败/冲突），已迁移或已跳过的项保持不变。
 * 同一实例已被其他批次写入时保留待办并标注版本冲突；写入失败保留待办待重试。
 */
export const writeBatch=(instances:Instance[],w:Workflow,batch:MigrationBatch,fail:boolean):{items:MigrationItem[];instances:Instance[]}=>{
  const claims=readClaims();
  let ins=instances;
  const items=batch.items.map(src=>{
    const it={...src};
    if(it.state==='migrated'||it.state==='skipped')return it;
    const inst=ins.find(x=>x.id===it.instanceId)!;
    if(inst.status==='completed')return{...it,state:'skipped' as const,reason:'实例已结束，保留原时间线'};
    if(enteredApproval(w,inst))return{...it,state:'skipped' as const,reason:'已进入人工审批，保留原时间线'};
    if(it.sourceVersion==null){
      const bf=backfillVersion(w,inst);
      if(bf==null)return{...it,state:'pending' as const,reason:'缺少版本号且无法按最后执行节点回填'};
      it.sourceVersion=bf;it.backfilled=true;
    }
    if(it.sourceVersion>=batch.targetVersion)return{...it,state:'skipped' as const,reason:'实例已在当前版本'};
    const owner=claims[it.instanceId];
    if(owner&&owner!==batch.id)return{...it,state:'conflict' as const,reason:`版本冲突：实例已被批次 ${owner} 写入`};
    if(fail)return{...it,state:'failed' as const,reason:'批次写入失败，待重试'};
    writeClaim(it.instanceId,batch.id);claims[it.instanceId]=batch.id;
    ins=ins.map(x=>x.id===it.instanceId?migrate(x,batch.targetVersion):x);
    return{...it,state:'migrated' as const,reason:undefined};
  });
  return{items,instances:ins};
};

export const todoCount=(items:MigrationItem[])=>items.filter(i=>i.state==='pending'||i.state==='failed'||i.state==='conflict').length;
