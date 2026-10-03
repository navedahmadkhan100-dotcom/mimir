const ALIASES = new Map(Object.entries({
  'azure ad': 'microsoft entra id', 'aad': 'microsoft entra id', 'entra': 'microsoft entra id',
  'entra id': 'microsoft entra id', 'microsoft entra': 'microsoft entra id', 'azure active directory': 'microsoft entra id',
  'gcp': 'google cloud platform', 'google cloud': 'google cloud platform',
  'o365': 'microsoft 365', 'office 365': 'microsoft 365', 'm365': 'microsoft 365',
  'sccm': 'microsoft configuration manager', 'configmgr': 'microsoft configuration manager', 'mecm': 'microsoft configuration manager',
  'intune': 'microsoft intune', 'autopilot': 'windows autopilot',
  'react.js': 'react', 'reactjs': 'react', 'node.js': 'node', 'nodejs': 'node',
  'c sharp': 'c#', 'csharp': 'c#', 'dotnet': '.net', '.net core': '.net',
  'azure kubernetes service': 'aks', 'amazon elastic kubernetes service': 'eks', 'google kubernetes engine': 'gke',
  'gitlab ci/cd': 'gitlab ci', 'gitlab cicd': 'gitlab ci',
  'continuous integration/continuous delivery': 'ci/cd', 'continuous integration and continuous delivery': 'ci/cd',
  'infrastructure-as-code': 'infrastructure as code', 'iac': 'infrastructure as code',
  'jfrog': 'jfrog artifactory', 'artifactory': 'jfrog artifactory', 'nexus': 'sonatype nexus',
  'ms sql': 'sql server', 'mssql': 'sql server', 'microsoft sql server': 'sql server',
  'vmware esx': 'vmware vsphere', 'vmware esxi': 'vmware vsphere', 'esxi': 'vmware vsphere', 'vsphere': 'vmware vsphere',
  'vcenter': 'vmware vcenter', 'vmware vcenter server': 'vmware vcenter',
  'oracle fusion financials cloud': 'oracle fusion financials', 'oracle financials cloud': 'oracle fusion financials',
  'oracle fusion cloud financials': 'oracle fusion financials', 'oracle erp cloud': 'oracle fusion cloud erp',
  'oracle fusion erp': 'oracle fusion cloud erp', 'oracle cloud erp': 'oracle fusion cloud erp',
  'oracle hcm cloud': 'oracle fusion hcm', 'oracle fusion cloud hcm': 'oracle fusion hcm',
  'oracle procurement cloud': 'oracle fusion procurement', 'oracle fusion procurement cloud': 'oracle fusion procurement',
  'oracle scm cloud': 'oracle fusion scm', 'oracle fusion scm cloud': 'oracle fusion scm',
  'oracle ebs': 'oracle e-business suite', 'ebs': 'oracle e-business suite', 'oracle r12': 'oracle e-business suite r12',
  'e-business suite r12': 'oracle e-business suite r12', 'oci': 'oracle cloud infrastructure',
  'sap s4hana': 'sap s/4hana', 's4 hana': 'sap s/4hana', 's/4 hana': 'sap s/4hana',
  'service now': 'servicenow', 'snow': 'servicenow',
  'powerbi': 'power bi', 'ms power bi': 'power bi',
  'azure synapse analytics': 'azure synapse', 'adf': 'azure data factory',
}));

const FACTS = new Map();
function addFact(source, relation, targets) {
  const key = normalizeConcept(source);
  if (!FACTS.has(key)) FACTS.set(key, []);
  for (const target of targets) FACTS.get(key).push({ relation, target: normalizeConcept(target) });
}

// Canonical product/model facts: objective classification, not speculative similarity.
addFact('oracle fusion financials', 'canonical', ['oracle fusion cloud erp','oracle erp','saas','oracle cloud']);
addFact('oracle fusion cloud erp', 'canonical', ['oracle erp','saas','oracle cloud']);
addFact('oracle fusion procurement', 'canonical', ['oracle fusion cloud erp','oracle erp','saas','procurement']);
addFact('oracle fusion scm', 'canonical', ['oracle cloud scm','saas','supply chain management']);
addFact('oracle fusion hcm', 'canonical', ['oracle cloud hcm','saas','human capital management']);
addFact('oracle e-business suite r12', 'canonical', ['oracle e-business suite','oracle erp','r12']);
addFact('oracle cloud infrastructure', 'canonical', ['cloud infrastructure','iaas','oracle cloud']);
addFact('sap s/4hana', 'canonical', ['sap erp','erp']);
addFact('aks', 'canonical', ['kubernetes','managed kubernetes','azure']);
addFact('eks', 'canonical', ['kubernetes','managed kubernetes','aws']);
addFact('gke', 'canonical', ['kubernetes','managed kubernetes','google cloud platform']);
addFact('openshift', 'canonical', ['kubernetes','container platform','container orchestration']);
addFact('vmware vsphere', 'canonical', ['vmware','server virtualization','virtualization']);
addFact('vmware vcenter', 'canonical', ['vmware','virtualization management']);
addFact('microsoft intune', 'canonical', ['endpoint management','uem','microsoft endpoint management']);
addFact('microsoft configuration manager', 'canonical', ['endpoint management','configuration management']);
addFact('windows autopilot', 'canonical', ['endpoint provisioning','windows device provisioning']);
addFact('cyberark', 'canonical', ['privileged access management','pam']);
addFact('servicenow itom', 'canonical', ['it operations management','itom']);
addFact('power bi', 'canonical', ['business intelligence','analytics','data visualization']);
addFact('databricks', 'canonical', ['data engineering','lakehouse']);
addFact('azure synapse', 'canonical', ['data warehouse','analytics','azure data platform']);
addFact('azure data factory', 'canonical', ['data integration','etl','azure data platform']);

// Ecosystem/capability implications.
for (const [s, targets] of [
  ['c#',['.net']], ['asp.net core',['.net','web development']], ['blazor',['.net','c#','web development']],
  ['entity framework',['.net','orm','sql']], ['azure devops',['azure','devops','ci/cd']],
  ['azure functions',['azure','serverless']], ['aws lambda',['aws','serverless']],
  ['amazon ecr',['aws','container registry']], ['azure container registry',['azure','container registry']],
  ['jenkins',['ci/cd']], ['gitlab ci',['ci/cd']], ['github actions',['ci/cd']], ['azure pipelines',['ci/cd','azure devops']],
  ['terraform',['infrastructure as code']], ['pulumi',['infrastructure as code']], ['cloudformation',['infrastructure as code','aws']],
  ['arm templates',['infrastructure as code','azure']], ['bicep',['infrastructure as code','azure']],
  ['sonatype nexus',['artifact management','dependency management']], ['jfrog artifactory',['artifact management','dependency management']],
  ['docker',['containers']], ['kubernetes',['container orchestration']], ['microsoft entra id',['identity and access management','iam','azure']],
  ['oracle aim',['oracle methodology']], ['oracle oum',['oracle methodology']], ['oracle tcm',['oracle methodology']],
]) addFact(s, 'implied', targets);

const FUNCTIONAL_FAMILIES = [
  ['jenkins','gitlab ci','github actions','azure pipelines','circleci','teamcity'],
  ['terraform','pulumi','cloudformation','arm templates','bicep'],
  ['sonatype nexus','jfrog artifactory'],
  ['aws','azure','google cloud platform'],
  ['aks','eks','gke','openshift'],
  ['microsoft intune','microsoft configuration manager'],
  ['oracle oum','oracle tcm','oracle aim'],
];

const TRANSFERABLE_FAMILIES = [
  ['sql server','postgresql','mysql','oracle database'], ['react','angular','vue'],
  ['rabbitmq','azure service bus','amazon sqs','kafka'],
  ['oracle e-business suite','oracle fusion cloud erp','sap s/4hana'],
];

export const RELATION_RANK = { none:0, adjacent:1, transferable:2, functional:3, implied:4, equivalent:5, canonical:6, direct:7 };

export function normalizeConcept(value = '') {
  const cleaned = String(value).toLowerCase().replace(/[®™]/g,'').replace(/\s+/g,' ').trim();
  return ALIASES.get(cleaned) || cleaned;
}

export function conceptSurfaceForms(concept = '') {
  const normalized = normalizeConcept(concept);
  const forms = new Set([normalized, String(concept).toLowerCase().trim()]);
  for (const [alias, target] of ALIASES.entries()) if (target === normalized) forms.add(alias);
  return [...forms].filter((x) => x && x.length >= 3).sort((a,b) => b.length - a.length);
}

function familyContains(family, value) { return family.some((item) => normalizeConcept(item) === value); }

function graphRelation(source, target) {
  const sOriginal = String(source).toLowerCase().replace(/\s+/g,' ').trim();
  const tOriginal = String(target).toLowerCase().replace(/\s+/g,' ').trim();
  const s = normalizeConcept(source); const t = normalizeConcept(target);
  if (!s || !t) return 'none';
  if (s === t) return sOriginal === tOriginal ? 'direct' : 'equivalent';

  for (const fact of FACTS.get(s) || []) if (fact.target === t) return fact.relation;
  for (const family of FUNCTIONAL_FAMILIES) if (familyContains(family,s) && familyContains(family,t)) return 'functional';
  for (const family of TRANSFERABLE_FAMILIES) if (familyContains(family,s) && familyContains(family,t)) return 'transferable';

  const sParents = new Set((FACTS.get(s) || []).map((x) => x.target));
  const tParents = new Set((FACTS.get(t) || []).map((x) => x.target));
  for (const parent of sParents) {
    if (tParents.has(parent) && ['ci/cd','infrastructure as code','artifact management','managed kubernetes','endpoint management'].includes(parent)) return 'functional';
  }
  return 'none';
}

export function relationBetween(source, target) { return graphRelation(source, target); }

export function strongestOntologyRelation(requirement, evidenceItems = []) {
  const targets = [...(requirement.target_concepts || []), ...(requirement.alternatives || [])].filter(Boolean);
  if (requirement.deployment_model && !['not_applicable','unknown'].includes(requirement.deployment_model)) targets.push(requirement.deployment_model);
  let best = { relation:'none', path:[] };
  for (const evidence of evidenceItems) {
    const sources = [...(evidence.skills || []), ...(evidence.capabilities || [])].filter(Boolean);
    for (const source of sources) for (const target of targets) {
      const relation = graphRelation(source,target);
      if ((RELATION_RANK[relation]||0) > (RELATION_RANK[best.relation]||0)) {
        best = { relation, path: relation === 'none' ? [] : [{ from: source, relation, to: target }] };
      }
    }
  }
  return best;
}

export function evidenceSupportsConcept(evidence, concept, minimumRelation = 'canonical') {
  const threshold = RELATION_RANK[minimumRelation] ?? RELATION_RANK.canonical;
  const sources = [...(evidence.skills || []), ...(evidence.capabilities || [])].filter(Boolean);
  return sources.some((source) => (RELATION_RANK[graphRelation(source, concept)] || 0) >= threshold);
}

export function reconcileRelation(requirement, evidenceItems, modelRelation, modelPath = []) {
  const graph = strongestOntologyRelation(requirement, evidenceItems);
  const modelRank = RELATION_RANK[modelRelation] ?? 0;
  const graphRank = RELATION_RANK[graph.relation] ?? 0;
  if (graphRank > modelRank) return { relation:graph.relation, inferencePath:graph.path, reconciledByOntology:true };
  return { relation:modelRelation || 'none', inferencePath:modelPath || [], reconciledByOntology:false };
}
