import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrchestrationTemplate } from '@do-what/protocol';
import { TopologyValidator } from '../orchestration/topology-validator.js';

function node(nodeId: string): OrchestrationTemplate['nodes'][number] {
  return {
    kind: 'step',
    node_id: nodeId,
  };
}

function edge(
  from: string,
  to: string,
  kind: OrchestrationTemplate['edges'][number]['kind'] = 'forward',
): OrchestrationTemplate['edges'][number] {
  return {
    from,
    kind,
    to,
  };
}

function createTemplate(
  topology: OrchestrationTemplate['topology'],
  nodes: OrchestrationTemplate['nodes'],
  edges: OrchestrationTemplate['edges'],
  overrides?: Partial<OrchestrationTemplate['constraints']>,
): OrchestrationTemplate {
  return {
    constraints: {
      max_fan_out: overrides?.max_fan_out ?? 3,
      max_loop_count: overrides?.max_loop_count ?? 3,
      max_parallel: overrides?.max_parallel ?? 5,
    },
    edges,
    nodes,
    template_id: `template-${topology ?? 'unknown'}`,
    topology,
    topology_hint: topology,
  };
}

describe('topology-validator', () => {
  const validator = new TopologyValidator();

  it('accepts a linear template', () => {
    const result = validator.validate(
      createTemplate(
        'linear',
        [node('a'), node('b'), node('c')],
        [
          edge('a', 'b'),
          edge('b', 'c'),
        ],
      ),
    );
    assert.equal(result.valid, true);
    assert.equal(result.topology_kind, 'linear');
  });

  it('accepts a parallel_merge template', () => {
    const result = validator.validate(
      createTemplate(
        'parallel_merge',
        [node('start'), node('a'), node('b'), node('merge')],
        [
          edge('start', 'a'),
          edge('start', 'b'),
          edge('a', 'merge'),
          edge('b', 'merge'),
        ],
      ),
    );
    assert.equal(result.valid, true);
    assert.equal(result.topology_kind, 'parallel_merge');
  });

  it('accepts a revise_loop template', () => {
    const result = validator.validate(
      createTemplate(
        'revise_loop',
        [node('draft'), node('review')],
        [
          edge('draft', 'review'),
          edge('review', 'draft', 'back'),
        ],
      ),
    );
    assert.equal(result.valid, true);
    assert.equal(result.topology_kind, 'revise_loop');
  });

  it('accepts a bounded_fan_out template', () => {
    const result = validator.validate(
      createTemplate(
        'bounded_fan_out',
        [node('start'), node('a'), node('b'), node('merge')],
        [
          edge('start', 'a'),
          edge('start', 'b'),
          edge('a', 'merge'),
          edge('b', 'merge'),
        ],
      ),
    );
    assert.equal(result.valid, true);
    assert.equal(result.topology_kind, 'bounded_fan_out');
  });

  it('rejects parallel branches above the configured limit', () => {
    const result = validator.validate(
      createTemplate(
        'parallel_merge',
        [
          node('start'),
          node('a'),
          node('b'),
          node('c'),
          node('d'),
          node('e'),
          node('f'),
          node('merge'),
        ],
        [
          edge('start', 'a'),
          edge('start', 'b'),
          edge('start', 'c'),
          edge('start', 'd'),
          edge('start', 'e'),
          edge('start', 'f'),
          edge('a', 'merge'),
          edge('b', 'merge'),
          edge('c', 'merge'),
          edge('d', 'merge'),
          edge('e', 'merge'),
          edge('f', 'merge'),
        ],
      ),
    );
    assert.equal(result.valid, false);
    assert.equal(result.violations[0]?.violation_type, 'parallel_limit');
  });

  it('rejects loop limits above 3', () => {
    const result = validator.validate(
      createTemplate(
        'revise_loop',
        [node('draft'), node('review')],
        [
          edge('draft', 'review'),
          edge('review', 'draft', 'back'),
        ],
        { max_loop_count: 4 },
      ),
    );
    assert.equal(result.valid, false);
    assert.equal(result.violations[0]?.violation_type, 'loop_limit');
  });

  it('rejects nested fan-out structures', () => {
    const result = validator.validate(
      createTemplate(
        'bounded_fan_out',
        [
          node('start'),
          node('branch-a'),
          node('branch-b'),
          node('nested-a'),
          node('nested-b'),
          node('merge'),
        ],
        [
          edge('start', 'branch-a'),
          edge('start', 'branch-b'),
          edge('branch-a', 'nested-a'),
          edge('branch-a', 'nested-b'),
          edge('branch-b', 'merge'),
          edge('nested-a', 'merge'),
          edge('nested-b', 'merge'),
        ],
      ),
    );
    assert.equal(result.valid, false);
    assert.equal(result.violations[0]?.violation_type, 'nested_parallel');
  });

  it('rejects free DAG structures that match no supported topology', () => {
    const result = validator.validate(
      createTemplate(
        undefined,
        [node('start'), node('branch-a'), node('branch-b'), node('merge')],
        [
          edge('start', 'branch-a'),
          edge('start', 'branch-b'),
          edge('branch-a', 'merge'),
          edge('branch-a', 'branch-b'),
          edge('branch-b', 'merge'),
        ],
      ),
    );
    assert.equal(result.valid, false);
    assert.equal(result.topology_kind, 'invalid');
    assert.equal(result.violations[0]?.violation_type, 'free_dag');
  });

  it('rejects bounded fan-out structures above the configured limit', () => {
    const result = validator.validate(
      createTemplate(
        'bounded_fan_out',
        [
          node('start'),
          node('a'),
          node('b'),
          node('c'),
          node('d'),
          node('merge'),
        ],
        [
          edge('start', 'a'),
          edge('start', 'b'),
          edge('start', 'c'),
          edge('start', 'd'),
          edge('a', 'merge'),
          edge('b', 'merge'),
          edge('c', 'merge'),
          edge('d', 'merge'),
        ],
      ),
    );
    assert.equal(result.valid, false);
    assert.equal(result.violations[0]?.violation_type, 'fan_out_limit');
  });

  it('rejects parallel_merge structures with multiple merge points', () => {
    const result = validator.validate(
      createTemplate(
        'parallel_merge',
        [node('start'), node('a'), node('b'), node('merge-a'), node('merge-b')],
        [
          edge('start', 'a'),
          edge('start', 'b'),
          edge('a', 'merge-a'),
          edge('b', 'merge-b'),
        ],
      ),
    );
    assert.equal(result.valid, false);
    assert.equal(result.violations[0]?.violation_type, 'multi_merge_point');
  });
});
