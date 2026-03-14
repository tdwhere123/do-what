// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createDeferredToV0_2Note,
  DEFERRED_TO_V0_2_TITLE,
} from '../../lib/ui-placeholders';
import type { SoulPanelProjection } from '../../stores/projection';
import { InspectorRail } from './inspector-rail';

function createSoulPanel(): SoulPanelProjection {
  const memory = {
    id: 'memory-1',
    kind: 'memory' as const,
    revision: 1,
    timestamp: '2026-03-12T00:00:00.000Z',
    title: 'Remember the run context',
  };

  return {
    entries: [memory],
    error: null,
    graphPreview: [],
    lastRevision: 1,
    memories: [memory],
    proposals: [],
    runId: 'run-1',
    status: 'idle',
  };
}

describe('InspectorRail unsupported actions', () => {
  it('keeps unsupported governance and memory actions visible but disabled', () => {
    const onApproveGate = vi.fn();
    const onBlockGate = vi.fn();
    const onGovernMemory = vi.fn();
    const onResolveDrift = vi.fn();

    render(
      <InspectorRail
        inspector={null}
        inspectorMode="git"
        interruptedDraft={null}
        isFrozen={false}
        onApproveGate={onApproveGate}
        onBlockGate={onBlockGate}
        onDismissOverlay={vi.fn()}
        onGovernMemory={onGovernMemory}
        onInspectorModeChange={vi.fn()}
        onResolveDrift={onResolveDrift}
        onRetryOverlay={vi.fn()}
        onReviewProposal={vi.fn()}
        overlays={[]}
        runTitle="Run 1"
        soulPanel={createSoulPanel()}
        workspaceName="Workspace Main"
      />,
    );

    const resolveDriftButton = screen.getByRole('button', { name: 'Resolve Drift' }) as HTMLButtonElement;
    const approveGateButton = screen.getByRole('button', { name: 'Approve Gate' }) as HTMLButtonElement;
    const blockGateButton = screen.getByRole('button', { name: 'Block Gate' }) as HTMLButtonElement;
    const pinButton = screen.getByRole('button', { name: 'Pin' }) as HTMLButtonElement;
    const editButton = screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement;
    const supersedeButton = screen.getByRole('button', { name: 'Supersede' }) as HTMLButtonElement;

    expect(resolveDriftButton.disabled).toBe(true);
    expect(approveGateButton.disabled).toBe(true);
    expect(blockGateButton.disabled).toBe(true);
    expect(pinButton.disabled).toBe(true);
    expect(editButton.disabled).toBe(true);
    expect(supersedeButton.disabled).toBe(true);

    expect(resolveDriftButton.getAttribute('title')).toBe(DEFERRED_TO_V0_2_TITLE);
    expect(approveGateButton.getAttribute('title')).toBe(DEFERRED_TO_V0_2_TITLE);
    expect(blockGateButton.getAttribute('title')).toBe(DEFERRED_TO_V0_2_TITLE);
    expect(pinButton.getAttribute('title')).toBe(DEFERRED_TO_V0_2_TITLE);
    expect(editButton.getAttribute('title')).toBe(DEFERRED_TO_V0_2_TITLE);
    expect(supersedeButton.getAttribute('title')).toBe(DEFERRED_TO_V0_2_TITLE);
    expect(screen.getByText(createDeferredToV0_2Note('治理写入动作'))).toBeTruthy();
    expect(screen.getByText(createDeferredToV0_2Note('记忆维护动作'))).toBeTruthy();

    fireEvent.click(resolveDriftButton);
    fireEvent.click(approveGateButton);
    fireEvent.click(blockGateButton);
    fireEvent.click(pinButton);
    fireEvent.click(editButton);
    fireEvent.click(supersedeButton);

    expect(onResolveDrift).not.toHaveBeenCalled();
    expect(onApproveGate).not.toHaveBeenCalled();
    expect(onBlockGate).not.toHaveBeenCalled();
    expect(onGovernMemory).not.toHaveBeenCalled();
  });
});
