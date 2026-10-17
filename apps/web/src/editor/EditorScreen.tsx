/** The dashboard editor's layout: the canvas, with the inspector docked right. Both are placeholders until Phase 4. */
export function EditorScreen() {
  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px]" data-testid="editor">
      <main aria-label="Canvas" className="grid place-items-center bg-surface-canvas p-4" data-testid="canvas">
        <p className="text-ink-muted">Charts you add will appear here.</p>
      </main>
      <aside aria-label="Inspector" className="border-l border-line bg-surface-panel p-4" data-testid="inspector">
        <h2 className="ui-eyebrow">Inspector</h2>
        <p className="pt-2 text-label text-ink-muted">Select a chart to change its data and format.</p>
      </aside>
    </div>
  );
}
