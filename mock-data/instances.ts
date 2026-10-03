import type {Instance} from '../src/types';
import {domains,users} from './catalog';
// 确定性生成 80 个实例：版本分布覆盖“停在旧版 / 已在当前版 / 缺失版本号”三类，
// 时间线覆盖“未进入人工审批 / 审批中 / 已结束 / 最后执行节点可回填版本”等迁移边界场景。
export const instances:Instance[]=Array.from({length:80},(_,i)=>{
  const status:Instance['status']=i<12?'abnormal':i<22?'timeout':i<50?'running':'completed';
  const wfVersion=(i%12)%3+1; // 与流程当前版本保持一致
  const legacy=i%7===3; // 旧实例缺少版本号
  const preApproval=i%3===2&&status!=='completed'; // 未进入人工审批
  const backfillable=legacy&&!preApproval&&i%2===0; // 最后执行节点（高额通知）只在 v2+ 出现，可回填
  const version=legacy?undefined:Math.max(1,wfVersion-((i>>2)%2));
  const currentNode=backfillable?'高额通知':preApproval?'提交申请':i%3===0?'直属主管审批':'金额判断';
  const timeline:Instance['timeline']=backfillable
    ?[{title:'提交申请',time:'09:10',status:'completed'},{title:'直属主管审批',time:'10:24',status:'completed'},{title:'金额判断',time:'11:05',status:'completed'},{title:'高额通知',time:'11:40',status:'current'}]
    :preApproval
      ?[{title:'提交申请',time:'09:10',status:'completed'},{title:'直属主管审批',time:'—',status:'pending'},{title:'金额判断',time:'—',status:'pending'}]
      :[{title:'提交申请',time:'09:10',status:'completed'},{title:'直属主管审批',time:'10:24',status:i%3===0?'current':'completed'},{title:'金额判断',time:'11:05',status:i%3!==0?'current':'pending'}];
  return {id:`INS-2026-${String(i+1).padStart(4,'0')}`,workflowId:`wf-${i%12+1}`,applicant:users[i%8],domain:domains[i%5],currentNode,status,submittedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${String(8+i%10).padStart(2,'0')}:10`,duration:status==='timeout'?`${28+i}h`:`${i%9+1}h ${i%6*10}m`,risk:i<22?'high':i<45?'medium':'low',version,timeline};
});
