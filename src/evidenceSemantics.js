export const EVIDENCE_SEMANTICS_VERSION = '5.0.0-evidence-action-semantics';

const ACTION_RULES = [
  ['architected','architecture', /\b(?:architected|architecting|designed\s+(?:the\s+)?architecture|defined?\s+(?:the\s+)?(?:architecture|strategy|roadmap)|governed?\s+(?:the\s+)?architecture|established?\s+(?:the\s+)?(?:architecture|governance)|solution\s+architect(?:ure|ed)?)\b/i],
  ['designed','design', /\b(?:designed|designing|blueprinted|created\s+(?:the\s+)?design)\b/i],
  ['led','leadership', /\b(?:led|lead|headed|directed|managed|oversaw|oversee|overseeing|owned|ownership|responsible\s+for)\b/i],
  ['implemented','implementation', /\b(?:implemented|implementing|deployed|deployment|rolled\s+out|built|configured)\b/i],
  ['migrated','migration', /\b(?:migrated|migration|transitioned|moderni[sz]ed)\b/i],
  ['administered','administration', /\b(?:administered|administration|operated|operations|maintained)\b/i],
  ['developed','development', /\b(?:developed|development|coded|coding|programmed|programming)\b/i],
  ['tested','testing', /\b(?:tested|testing|validated|validation|qa|quality\s+assurance)\b/i],
  ['supported','support', /\b(?:supported|supporting|troubleshot|troubleshooting)\b/i],
  ['assisted','assistance', /\b(?:assisted|helped|participated|contributed|involved)\b/i],
  ['worked_with','exposure', /\b(?:worked\s+(?:with|alongside)|exposure\s+to|familiar\s+with|knowledge\s+of)\b/i],
  ['mentioned','mention', /\b(?:skills?|technologies|tools|environment)\b/i],
];

const OWNERSHIP_STRONG = /\b(?:owned|ownership|responsible\s+for|accountable|led|headed|directed|architected|designed|defined|governed|established|orchestrated|decision[-\s]?making)\b/i;
const OWNERSHIP_SHARED = /\b(?:co[-\s]?led|collaborat(?:ed|ion)|partnered|jointly|team\s+responsible|contributed)\b/i;
const OWNERSHIP_WEAK = /\b(?:worked\s+alongside|assisted|supported|participated|exposure\s+to|familiar\s+with)\b/i;
const SCALE_RE = /\b(\d{2,}(?:,\d{3})*\+?\s*(?:(?:enterprise|global|international)\s+)?(?:users?|devices?|endpoints?|servers?|sites?|employees?|fte|tenants?|applications?|workloads?|countries?|regions?|teams?)|(?:multi[-\s]?million(?:[-\s]?(?:euro|dollar|pound))?|€|\$|£)\s?\d*[mk]?|enterprise[-\s]?wide|global|multi[-\s]?country|multi[-\s]?region|large[-\s]?scale|international\s+24\/7)\b/ig;
const COMPLEXITY_RE = /\b(?:multi[-\s]?tenant|hybrid|regulated|mission[-\s]?critical|high[-\s]?availability|disaster\s+recovery|zero[-\s]?downtime|global|enterprise|complex|integration|migration|security|governance)\b/ig;

const ACTION_LEVEL = Object.freeze({
  architecture: 6, design: 6, leadership: 5, implementation: 4, migration: 4,
  development: 4, administration: 3, testing: 3, support: 2, assistance: 1, exposure: 1, mention: 0,
});

function evidenceText(e = {}) { return `${e.quote || ''} ${e.visual_observation || ''} ${e.nearbyText || ''}`.trim(); }
function uniq(v = []) { return [...new Set(v.filter(Boolean))]; }

export function analyzeEvidenceSemantics(evidenceItems = []) {
  return (evidenceItems || []).map((e) => {
    const text = evidenceText(e);
    const actions = [];
    for (const [verb, type, re] of ACTION_RULES) if (re.test(text)) actions.push({ verb, type, level: ACTION_LEVEL[type] ?? 0 });
    actions.sort((a,b) => b.level - a.level);
    const strongest = actions[0] || { verb:'unknown', type:'unknown', level:0 };

    let ownership = 'unestablished';
    if (OWNERSHIP_STRONG.test(text)) ownership = 'direct';
    else if (OWNERSHIP_SHARED.test(text)) ownership = 'shared';
    else if (OWNERSHIP_WEAK.test(text)) ownership = 'contextual';
    if (e.source_type === 'visual' && ownership === 'direct' && !String(e.quote || '').trim()) ownership = 'unestablished';

    const scale = uniq([...text.matchAll(SCALE_RE)].map((m) => m[1])).slice(0,5);
    const complexity = uniq([...text.matchAll(COMPLEXITY_RE)].map((m) => m[0].toLowerCase())).slice(0,8);
    const maxConclusion = strongest.level >= 6 && ownership === 'direct' ? 'architecture_or_design_ownership'
      : strongest.level >= 5 && ['direct','shared'].includes(ownership) ? 'leadership_or_ownership'
      : strongest.level >= 4 ? 'hands_on_delivery'
      : strongest.level >= 3 ? 'hands_on_operation'
      : strongest.level >= 2 ? 'supporting_experience'
      : strongest.level >= 1 ? 'contextual_exposure'
      : 'mention_only';

    const prohibited = [];
    if (!['direct','shared'].includes(ownership)) prohibited.push('ownership');
    if (strongest.level < 6) prohibited.push('architecture_or_design');
    if (strongest.level < 5) prohibited.push('leadership');
    if (strongest.level < 4) prohibited.push('implementation_or_migration');
    if (!scale.length) prohibited.push('enterprise_scale');
    if (e.source_type === 'visual') prohibited.push('candidate_authorship_from_visual_alone');

    return {
      evidence_id: e.id,
      source_type: e.source_type,
      evidence_context_type: e.evidence_context_type || 'unknown',
      strongest_action: strongest,
      actions,
      ownership,
      scale,
      complexity,
      maximum_conclusion: maxConclusion,
      prohibited_inferences: uniq(prohibited),
      provenance: {
        source_page: e.source_page ?? null,
        source_hint: e.source_hint || '',
        visual_asset_id: e.visual_asset_id || null,
      },
    };
  });
}

export function semanticsByEvidenceId(items = []) { return new Map(items.map((x) => [x.evidence_id, x])); }
