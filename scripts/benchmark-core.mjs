import { performance } from 'node:perf_hooks';
import { buildClaimModel } from '../src/claimModel.js';
import { analyzeEvidenceSemantics } from '../src/evidenceSemantics.js';
import { assessClaims } from '../src/entailment.js';
import { runOdinReview, applyOdinToClaims, buildVerificationQuestions } from '../src/odin.js';
import { buildPolicyDecisions } from '../src/policyEngine.js';
import { buildEvidenceGraph } from '../src/evidenceGraph.js';
import { computeDeterministicScore } from '../src/scoring.js';
import { auditStructuredJd } from '../src/jdAudit.js';
import { buildEvidenceIntelligenceRecord } from '../src/evidenceIntelligence.js';

function fixture(count) {
  const requirements = [];
  const evidence = [];
  const matches = [];
  for (let i = 0; i < count; i += 1) {
    const id = `R${i + 1}`;
    const eId = `E${i + 1}`;
    const tech = i % 3 === 0 ? 'Microsoft Intune' : i % 3 === 1 ? 'Azure' : 'Kubernetes';
    requirements.push({
      id, text:`Design and own ${tech} capability ${i + 1} in an enterprise environment`,
      category:'skill', priority:i < Math.ceil(count * .65) ? 'required' : 'preferred', priority_basis:'required',
      assessment_hint:'score', strictness:i % 4 === 0 ? 'exact_required' : 'normal',
      requirement_logic:'single', requirement_type:i % 4 === 0 ? 'exact_technology' : 'capability',
      target_concepts:[tech], alternatives:[], minimum_years:null, minimum_count:null, count_unit:'',
      required_role_context:[], lifecycle_scope:'not_applicable', deployment_model:'not_applicable', exact_credential:'', version_constraint:'',
    });
    evidence.push({
      id:eId, source_type:i % 5 === 0 ? 'visual' : 'text',
      quote:i % 5 === 0 ? '' : `Designed and owned ${tech} solution for ${1000 + i * 100} enterprise endpoints/users.`,
      visual_asset_id:i % 5 === 0 ? `CV-V${i + 1}` : null,
      visual_observation:i % 5 === 0 ? `Architecture diagram shows ${tech} and enterprise integration components.` : '',
      source_page:(i % 8) + 1, source_hint:`Page ${(i % 8) + 1}`, skills:[tech], capabilities:['enterprise platform'],
      depth:i % 5 === 0 ? 'used' : 'led', recency_year:2026, duration_months:24,
      career_context:'Role', project_key:`P${Math.floor(i/3)+1}`, role_context:'Architect', lifecycle_phases:['blueprint_design','build_config'],
    });
    matches.push({ requirement_id:id, evidence_ids:[eId], relation:i % 7 === 0 ? 'adjacent' : 'direct', support_state:'documented', reason:'Matched.', inference_path:[], lifecycle_phases:['blueprint_design'], qualifying_instances:[] });
  }
  return { structured_jd:{ role_title:'Synthetic Enterprise Architect', role_summary:'Benchmark fixture', requirements }, evidence, matches };
}

function runPipeline(result) {
  const jd = result.structured_jd;
  const claimModel = buildClaimModel(jd);
  const semantics = analyzeEvidenceSemantics(result.evidence);
  const pre = assessClaims({ claimModel, structuredJd:jd, matches:result.matches, evidenceSemantics:semantics });
  const odin = runOdinReview(result, pre, semantics);
  const claims = applyOdinToClaims(pre, odin);
  const policy = buildPolicyDecisions({ structuredJd:jd, matches:result.matches, claimAssessments:claims, evidence:result.evidence });
  const graph = buildEvidenceGraph({ structuredJd:jd, evidence:result.evidence, matches:result.matches, claimAssessments:claims, evidenceSemantics:semantics });
  const score = computeDeterministicScore(result, jd, { referenceYear:2026, policyDecisions:policy, claimAssessments:claims });
  const questions = buildVerificationQuestions(result, odin, claims);
  const jdAudit = auditStructuredJd(jd);
  const intelligence = buildEvidenceIntelligenceRecord({ auditId:'MIMIR-BENCH', structuredJd:jd, claimAssessments:claims, evidenceSemantics:semantics, policyDecisions:policy });
  return { graph, score, questions, jdAudit, intelligence };
}

function percentile(values, p) {
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
}

for (const count of [10, 25, 50, 100]) {
  const result = fixture(count);
  for (let i=0;i<100;i+=1) runPipeline(result);
  const times=[];
  const cpuStart=process.cpuUsage();
  const wallStart=performance.now();
  const iterations = count <= 25 ? 1000 : count <= 50 ? 500 : 250;
  for (let i=0;i<iterations;i+=1) {
    const t0=performance.now();
    runPipeline(result);
    times.push(performance.now()-t0);
  }
  const wall=performance.now()-wallStart;
  const cpu=process.cpuUsage(cpuStart);
  const cpuMs=(cpu.user+cpu.system)/1000;
  console.log(JSON.stringify({
    requirements:count,
    iterations,
    avgWallMs:Number((wall/iterations).toFixed(3)),
    p50WallMs:Number(percentile(times,.50).toFixed(3)),
    p95WallMs:Number(percentile(times,.95).toFixed(3)),
    avgCpuMs:Number((cpuMs/iterations).toFixed(3)),
    totalCpuMs:Number(cpuMs.toFixed(1)),
  }));
}
