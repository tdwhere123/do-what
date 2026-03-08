import type {
  OrchestrationTemplate,
  TopologyKind,
  TopologyViolation,
  ValidationResult,
} from '@do-what/protocol';

function buildDegrees(template: OrchestrationTemplate) {
  const indegree = new Map<string, number>();
  const outdegree = new Map<string, number>();
  for (const node of template.nodes) {
    indegree.set(node.node_id, 0);
    outdegree.set(node.node_id, 0);
  }
  for (const edge of template.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outdegree.set(edge.from, (outdegree.get(edge.from) ?? 0) + 1);
  }
  return { indegree, outdegree };
}

function countAcyclicNodes(template: OrchestrationTemplate): number {
  const { indegree } = buildDegrees(template);
  const queue = template.nodes
    .filter((node) => (indegree.get(node.node_id) ?? 0) === 0)
    .map((node) => node.node_id);
  let handled = 0;

  while (queue.length > 0) {
    const current = queue.shift() as string;
    handled += 1;
    for (const edge of template.edges.filter((candidate) => candidate.from === current)) {
      const nextDegree = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, nextDegree);
      if (nextDegree === 0) {
        queue.push(edge.to);
      }
    }
  }

  return handled;
}

function invalidResult(violations: TopologyViolation[]): ValidationResult {
  return {
    topology_kind: 'invalid',
    valid: false,
    violations,
  };
}

function validateLinear(template: OrchestrationTemplate): ValidationResult {
  const { indegree, outdegree } = buildDegrees(template);
  const hasCycle = countAcyclicNodes(template) !== template.nodes.length;
  const branchingNode = template.nodes.find(
    (node) => (indegree.get(node.node_id) ?? 0) > 1 || (outdegree.get(node.node_id) ?? 0) > 1,
  );
  if (hasCycle || branchingNode) {
    return invalidResult([
      {
        description: 'linear topology must be a single acyclic chain',
        node_ids: branchingNode ? [branchingNode.node_id] : template.nodes.map((node) => node.node_id),
        violation_type: 'free_dag',
      },
    ]);
  }
  return {
    topology_kind: 'linear',
    valid: true,
    violations: [],
  };
}

function validateParallelMerge(template: OrchestrationTemplate): ValidationResult {
  const { indegree, outdegree } = buildDegrees(template);
  const starts = template.nodes.filter((node) => (indegree.get(node.node_id) ?? 0) === 0);
  const merges = template.nodes.filter((node) => (outdegree.get(node.node_id) ?? 0) === 0);
  const parallelNodes = template.nodes.filter((node) => (outdegree.get(node.node_id) ?? 0) > 1);
  if (countAcyclicNodes(template) !== template.nodes.length) {
    return invalidResult([
      {
        description: 'parallel_merge cannot contain cycles',
        node_ids: template.nodes.map((node) => node.node_id),
        violation_type: 'free_dag',
      },
    ]);
  }
  if (parallelNodes.length > 1) {
    return invalidResult([
      {
        description: 'parallel_merge cannot nest parallel branches',
        node_ids: parallelNodes.map((node) => node.node_id),
        violation_type: 'nested_parallel',
      },
    ]);
  }
  const start = parallelNodes[0] ?? starts[0];
  const merge = merges[0];
  const parallelCount = start ? outdegree.get(start.node_id) ?? 0 : 0;
  if (!start || !merge || starts.length !== 1 || merges.length !== 1) {
    return invalidResult([
      {
        description: 'parallel_merge requires one start and one merge node',
        node_ids: template.nodes.map((node) => node.node_id),
        violation_type: 'multi_merge_point',
      },
    ]);
  }
  if (parallelCount > template.constraints.max_parallel) {
    return invalidResult([
      {
        description: `parallel branches exceed max_parallel=${template.constraints.max_parallel}`,
        node_ids: [start.node_id],
        violation_type: 'parallel_limit',
      },
    ]);
  }
  if (parallelCount < 2 || (indegree.get(merge.node_id) ?? 0) !== parallelCount) {
    return invalidResult([
      {
        description: 'parallel branches must converge into one merge node',
        node_ids: [start.node_id, merge.node_id],
        violation_type: 'multi_merge_point',
      },
    ]);
  }
  return {
    topology_kind: 'parallel_merge',
    valid: true,
    violations: [],
  };
}

function validateReviseLoop(template: OrchestrationTemplate): ValidationResult {
  const backEdges = template.edges.filter((edge) => edge.kind === 'back');
  if (backEdges.length !== 1) {
    return invalidResult([
      {
        description: 'revise_loop requires exactly one back edge',
        node_ids: backEdges.flatMap((edge) => [edge.from, edge.to]),
        violation_type: 'loop_limit',
      },
    ]);
  }
  if (template.constraints.max_loop_count > 3) {
    return invalidResult([
      {
        description: 'revise_loop max_loop_count cannot exceed 3',
        node_ids: [backEdges[0].to],
        violation_type: 'loop_limit',
      },
    ]);
  }
  return {
    topology_kind: 'revise_loop',
    valid: true,
    violations: [],
  };
}

function validateBoundedFanOut(template: OrchestrationTemplate): ValidationResult {
  const { indegree, outdegree } = buildDegrees(template);
  const fanOutNodes = template.nodes.filter((node) => (outdegree.get(node.node_id) ?? 0) > 1);
  const mergeNodes = template.nodes.filter((node) => (indegree.get(node.node_id) ?? 0) > 1);
  if (fanOutNodes.length !== 1) {
    return invalidResult([
      {
        description: 'bounded_fan_out requires exactly one fan-out node',
        node_ids: fanOutNodes.map((node) => node.node_id),
        violation_type: 'nested_parallel',
      },
    ]);
  }
  const fanOutNode = fanOutNodes[0];
  const fanOutCount = outdegree.get(fanOutNode.node_id) ?? 0;
  if (fanOutCount > template.constraints.max_fan_out) {
    return invalidResult([
      {
        description: `fan-out exceeds max_fan_out=${template.constraints.max_fan_out}`,
        node_ids: [fanOutNode.node_id],
        violation_type: 'fan_out_limit',
      },
    ]);
  }
  if (mergeNodes.length !== 1 || (indegree.get(mergeNodes[0].node_id) ?? 0) !== fanOutCount) {
    return invalidResult([
      {
        description: 'bounded_fan_out requires one merge node that closes all branches',
        node_ids: [...fanOutNodes.map((node) => node.node_id), ...mergeNodes.map((node) => node.node_id)],
        violation_type: 'multi_merge_point',
      },
    ]);
  }
  return {
    topology_kind: 'bounded_fan_out',
    valid: true,
    violations: [],
  };
}

export class TopologyValidator {
  validate(template: OrchestrationTemplate): ValidationResult {
    const hintedTopology = template.topology ?? template.topology_hint;
    if (!hintedTopology) {
      return this.inferTopology(template);
    }
    return this.validateAs(template, hintedTopology);
  }

  private inferTopology(template: OrchestrationTemplate): ValidationResult {
    for (const topologyKind of [
      'linear',
      'parallel_merge',
      'revise_loop',
      'bounded_fan_out',
    ] as const) {
      const result = this.validateAs(template, topologyKind);
      if (result.valid) {
        return result;
      }
    }
    return invalidResult([
      {
        description: 'template does not match any supported topology',
        node_ids: template.nodes.map((node) => node.node_id),
        violation_type: 'free_dag',
      },
    ]);
  }

  private validateAs(
    template: OrchestrationTemplate,
    topologyKind: TopologyKind,
  ): ValidationResult {
    switch (topologyKind) {
      case 'linear':
        return validateLinear(template);
      case 'parallel_merge':
        return validateParallelMerge(template);
      case 'revise_loop':
        return validateReviseLoop(template);
      case 'bounded_fan_out':
        return validateBoundedFanOut(template);
    }
  }
}
