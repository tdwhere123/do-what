// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EngineSmileIcon, StatusRunningIcon, WorkbenchFlowerIcon } from './app-icons';

describe('svg icons', () => {
  it('renders raw SVG assets as reusable icon components with currentColor fills', () => {
    render(<WorkbenchFlowerIcon className="workbench-icon" data-testid="workbench-icon" />);

    const icon = screen.getByTestId('workbench-icon');
    expect(icon.getAttribute('class')).toContain('workbench-icon');
    expect(icon.innerHTML).toContain('currentColor');
  });

  it('respects the size prop and keeps accessibility optional', () => {
    render(<StatusRunningIcon data-testid="running-icon" size={28} title="Running" />);

    const icon = screen.getByTestId('running-icon');
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('style')).toContain('width: 28px');
    expect(icon.getAttribute('style')).toContain('height: 28px');
  });

  it('supports independent action icons without sharing runtime state', () => {
    render(<EngineSmileIcon data-testid="engine-icon" />);

    expect(screen.getByTestId('engine-icon').innerHTML.length).toBeGreaterThan(0);
  });
});
