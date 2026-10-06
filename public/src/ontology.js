const ALIASES = new Map(Object.entries({
  'azure ad': 'azure active directory',
  'aad': 'azure active directory',
  'entra': 'microsoft entra id',
  'entra id': 'microsoft entra id',
  'microsoft entra': 'microsoft entra id',
  'azure active directory': 'microsoft entra id',
  'gcp': 'google cloud platform',
  'google cloud': 'google cloud platform',
  'react.js': 'react',
  'reactjs': 'react',
  'node.js': 'node',
  'nodejs': 'node',
  'c sharp': 'c#',
  'csharp': 'c#',
  'dotnet': '.net',
  '.net core': '.net',
  'asp.net core': 'asp.net core',
  'azure kubernetes service': 'aks',
  'amazon elastic kubernetes service': 'eks',
  'google kubernetes engine': 'gke',
  'github actions': 'github actions',
  'gitlab ci/cd': 'gitlab ci',
  'gitlab cicd': 'gitlab ci',
  'continuous integration/continuous delivery': 'ci/cd',
  'continuous integration and continuous delivery': 'ci/cd',
  'infrastructure-as-code': 'infrastructure as code',
  'iac': 'infrastructure as code',
  'jfrog': 'jfrog artifactory',
  'artifactory': 'jfrog artifactory',
  'nexus': 'sonatype nexus',
  'ms sql': 'sql server',
  'mssql': 'sql server',
  'microsoft sql server': 'sql server',
}));

const IMPLIES = new Map([
  ['c#', ['.net']],
  ['aks', ['azure', 'kubernetes', 'managed kubernetes']],
  ['eks', ['aws', 'kubernetes', 'managed kubernetes']],
  ['gke', ['google cloud platform', 'kubernetes', 'managed kubernetes']],
  ['asp.net core', ['.net', 'web development']],
  ['blazor', ['.net', 'c#', 'web development']],
  ['entity framework', ['.net', 'sql', 'orm']],
  ['azure devops', ['azure', 'ci/cd', 'devops']],
  ['azure functions', ['azure', 'serverless']],
  ['azure event grid', ['azure', 'event driven architecture']],
  ['aws lambda', ['aws', 'serverless']],
  ['amazon ecr', ['aws', 'container registry']],
  ['azure container registry', ['azure', 'container registry']],
  ['jenkins', ['ci/cd']],
  ['gitlab ci', ['ci/cd']],
  ['github actions', ['ci/cd']],
  ['azure pipelines', ['ci/cd', 'azure devops']],
  ['terraform', ['infrastructure as code']],
  ['pulumi', ['infrastructure as code']],
  ['cloudformation', ['infrastructure as code', 'aws']],
  ['arm templates', ['infrastructure as code', 'azure']],
  ['bicep', ['infrastructure as code', 'azure']],
  ['sonatype nexus', ['artifact management', 'dependency management']],
  ['jfrog artifactory', ['artifact management', 'dependency management']],
  ['docker', ['containers']],
  ['kubernetes', ['container orchestration']],
]);

const FUNCTIONAL_FAMILIES = [
  ['jenkins', 'gitlab ci', 'github actions', 'azure pipelines', 'circleci', 'teamcity'],
  ['terraform', 'pulumi', 'cloudformation', 'arm templates', 'bicep'],
  ['sonatype nexus', 'jfrog artifactory'],
  ['aws', 'azure', 'google cloud platform'],
  ['aks', 'eks', 'gke', 'openshift'],
];

const TRANSFERABLE_FAMILIES = [
  ['sql server', 'postgresql', 'mysql', 'oracle database'],
  ['react', 'angular', 'vue'],
  ['rabbitmq', 'azure service bus', 'amazon sqs', 'kafka'],
];

const RELATION_RANK = {
  none: 0,
  adjacent: 1,
  transferable: 2,
  functional: 3,
  implied: 4,
  equivalent: 5,
  direct: 6,
};

export function normalizeConcept(value = '') {
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES.get(cleaned) || cleaned;
}

function familyContains(family, value) {
  return family.some((item) => normalizeConcept(item) === value);
}

function ontologyRelation(source, target) {
  const sOriginal = String(source).toLowerCase().replace(/\s+/g, ' ').trim();
  const tOriginal = String(target).toLowerCase().replace(/\s+/g, ' ').trim();
  const s = normalizeConcept(source);
  const t = normalizeConcept(target);
  if (!s || !t) return 'none';
  if (s === t) return sOriginal === tOriginal ? 'direct' : 'equivalent';

  const impliedTargets = (IMPLIES.get(s) || []).map(normalizeConcept);
  if (impliedTargets.includes(t)) return 'implied';

  for (const family of FUNCTIONAL_FAMILIES) {
    if (familyContains(family, s) && familyContains(family, t)) return 'functional';
  }
  for (const family of TRANSFERABLE_FAMILIES) {
    if (familyContains(family, s) && familyContains(family, t)) return 'transferable';
  }

  // Shared parent capability: different tools that prove the same underlying function.
  const sParents = new Set((IMPLIES.get(s) || []).map(normalizeConcept));
  const tParents = new Set((IMPLIES.get(t) || []).map(normalizeConcept));
  for (const parent of sParents) {
    if (tParents.has(parent) && ['ci/cd', 'infrastructure as code', 'artifact management', 'managed kubernetes'].includes(parent)) {
      return 'functional';
    }
  }

  return 'none';
}

export function strongestOntologyRelation(requirement, evidenceItems = []) {
  const targets = [
    ...(requirement.target_concepts || []),
    ...(requirement.alternatives || []),
  ].filter(Boolean);

  let best = { relation: 'none', path: [] };
  for (const evidence of evidenceItems) {
    const sources = [...(evidence.skills || []), ...(evidence.capabilities || [])].filter(Boolean);
    for (const source of sources) {
      for (const target of targets) {
        const relation = ontologyRelation(source, target);
        if ((RELATION_RANK[relation] || 0) > (RELATION_RANK[best.relation] || 0)) {
          best = {
            relation,
            path: relation === 'none' ? [] : [{ from: source, relation, to: target }],
          };
        }
      }
    }
  }
  return best;
}

export function reconcileRelation(requirement, evidenceItems, modelRelation, modelPath = []) {
  const graph = strongestOntologyRelation(requirement, evidenceItems);
  const modelRank = RELATION_RANK[modelRelation] ?? 0;
  const graphRank = RELATION_RANK[graph.relation] ?? 0;

  if (graphRank > modelRank) {
    return {
      relation: graph.relation,
      inferencePath: graph.path,
      reconciledByOntology: true,
    };
  }
  return {
    relation: modelRelation || 'none',
    inferencePath: modelPath || [],
    reconciledByOntology: false,
  };
}

export { RELATION_RANK };
