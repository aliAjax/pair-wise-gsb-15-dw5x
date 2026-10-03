import type {Instance} from '../src/types';
import {domains,users} from './catalog';
// 执行阶段: 0 提交申请(未进审批) 1 直属主管审批 2 金额判断 3 高额通知 4 结束
const names=['提交申请','直属主管审批','金额判断','高额通知','结束'];
const timelineFor=(stage:number):Instance['timeline']=>[
 {title:'提交申请',time:'09:10',status:stage===0?'current':'completed'},
 {title:'直属主管审批',time:'10:24',status:stage===0?'pending':stage===1?'current':'completed'},
 {title:'金额判断',time:'11:05',status:stage<2?'pending':stage===2?'current':'completed'},
 ...stage>=3?[{title:'高额通知',time:'11:40',status:stage===3?'current':'completed'}]:[],
 ...stage>=4?[{title:'结束',time:'12:00',status:'completed'}]:[]];
export const instances:Instance[]=Array.from({length:80},(_,i)=>{
 const status:Instance['status']=i<12?'abnormal':i<22?'timeout':i<50?'running':'completed';
 const stage=status==='completed'?4:i%3===0?1:i%3===1?2:0;
 const curVer=i%12%3+1; // 与 workflows 种子当前版本一致
 const version=i%5===2?undefined:i%5===0||i%5===3?1:curVer; // 部分旧实例没有版本号, 迁移时按执行节点回填
 return{id:`INS-2026-${String(i+1).padStart(4,'0')}`,workflowId:`wf-${i%12+1}`,applicant:users[i%8],domain:domains[i%5],currentNode:names[stage],status,submittedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${String(8+i%10).padStart(2,'0')}:10`,duration:status==='timeout'?`${28+i}h`:`${i%9+1}h ${i%6*10}m`,risk:i<22?'high':i<45?'medium':'low',version,timeline:timelineFor(stage)};
});
// 迁移批次演示(wf-2 采购合同审批, 当前 v2, v2 起新增「高额通知」): 覆盖可迁移/回填/审批中/已结束/无法回填等边界
const set=(id:string,p:Partial<Instance>)=>Object.assign(instances.find(x=>x.id===id)!,p);
const at=(stage:number)=>({currentNode:names[stage],timeline:timelineFor(stage)});
set('INS-2026-0002',{status:'running',version:1,...at(0)}); // 旧版且未进审批 → 可迁移
set('INS-2026-0014',{status:'running',version:undefined,...at(0)}); // 无版本号 → 按最后执行节点回填 v1 → 可迁移
set('INS-2026-0026',{status:'running',version:1,...at(1)}); // 已进入人工审批 → 保留原时间线
set('INS-2026-0038',{status:'running',version:undefined,currentNode:'历史遗留节点',timeline:[{title:'提交申请',time:'09:10',status:'completed'},{title:'历史遗留节点',time:'10:02',status:'current'}]}); // 回填不了 → 留在待处理
set('INS-2026-0050',{status:'running',version:2,...at(0)}); // 已是最新版本 → 保留
set('INS-2026-0062',{status:'completed',version:1,...at(4)}); // 已结束 → 保留原时间线
set('INS-2026-0074',{status:'running',version:1,...at(0)}); // 旧版且未进审批 → 可迁移
