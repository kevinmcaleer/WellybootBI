// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('shows the product name and the dashboard format version from the shared package', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Wellyboot BI' })).toBeInTheDocument();
    expect(screen.getByText('Dashboard format version 1')).toBeInTheDocument();
  });
});
