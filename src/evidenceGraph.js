import { normalizeConcept } from './ontology.js';

export const EVIDENCE_GRAPH_VERSION = '4.0.0-evidence-graph';

export function buildEvidenceGraph({ structuredJd, evidence = [], matches = [], claimAssessments = [], evidenceSemantics = [] }) {
  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const addNode = (node) => { if (!seenNodes.has(node.id)) { seenNodes.add(node.id); nodes.push(node); } };
  const addEdge = (from, relation, to, metadata={}) => edges.push({ from, relation, to, ...metadata });
  const claimMap = new Map(claimAssessments.map((c)=>[c.requirement_id,c]));
  const semMap = new Map(evidenceSemantics.map((s)=>[s.evidence_id,s]));

  for (const req of structuredJd.requirements || []) {
    const claim = claimMap.get(req.id);
    const claimId = claim?.claim_id || `C-${req.id}`;
    addNode({ id:claimId, type:'claim', requirement_id:req.id, label:req.text, state:claim?.state || 'unknown' });
    for (const concept of [...(req.target_concepts || []), ...(req.alternatives || [])]) {
      const normalized = normalizeConcept(concept); if (!normalized) continue;
      const conceptId = `K:${normalized}`;
      addNode({ id:conceptId, type:'concept', label:normalized });
      addEdge(claimId,'TARGETS',conceptId);
    }
  }

  for (const item of evidence) {
    const sem = semMap.get(item.id);
    addNode({
      id:item.id, type:'evidence', source_type:item.source_type, source_page:item.source_page ?? null,
      visual_asset_id:item.visual_asset_id || null, action_type:sem?.strongest_action?.type || 'unknown',
      ownership:sem?.ownership || 'unestablished', maximum_conclusion:sem?.maximum_conclusion || 'unknown',
    });
    for (const concept of [...(item.skills || []), ...(item.capabilities || [])]) {
      const normalized = normalizeConcept(concept); if (!normalized) continue;
      const conceptId = `K:${normalized}`;
      addNode({ id:conceptId, type:'concept', label:normalized });
      addEdge(item.id,'EVIDENCES_CONCEPT',conceptId);
    }
    if (item.project_key) {
      const projectId = `P:${String(item.project_key).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,80)}`;
      addNode({ id:projectId, type:'project', label:item.project_key });
      addEdge(projectId,'CONTAINS_EVIDENCE',item.id);
    }
  }

  for (const match of matches) {
    const claim = claimMap.get(match.requirement_id);
    const claimId = claim?.claim_id || `C-${match.requirement_id}`;
    for (const evidenceId of match.evidence_ids || []) {
      addEdge(evidenceId,'SUPPORTS_CLAIM',claimId,{ match_relation:match.relation, support_state:match.support_state, final_claim_state:claim?.state || 'unknown' });
    }
  }

  return { version:EVIDENCE_GRAPH_VERSION, nodes, edges, counts:{ nodes:nodes.length, edges:edges.length } };
}
