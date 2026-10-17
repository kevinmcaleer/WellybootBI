// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusStrip } from './StatusStrip';

afterEach(cleanup);

describe('StatusStrip', () => {
  it('reads out the counts as they change, but not what sits at its end', () => {
    render(<StatusStrip rows={4} cols={3} end={<span data-testid="end">Engine ready</span>} />);
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('4 rows');
    expect(live).toHaveTextContent('3 cols');
    expect(live).not.toContainElement(screen.getByTestId('end'));
    expect(live.closest('footer')).not.toBeNull();
  });

  it('shows only its end when there is nothing to count', () => {
    render(<StatusStrip end="Engine ready" />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByText('Engine ready')).toBeInTheDocument();
  });
});
