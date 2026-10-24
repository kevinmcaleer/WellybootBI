import { useState } from 'react';
import { useDashboardStore } from '../model/dashboardStore';
import { Dialog, Field, TextInput } from '../ui';

/** Rename the open dashboard, from the menu on its name in the toolbar. */
export function RenameDashboardDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(() => useDashboardStore.getState().name);
  return (
    <Dialog
      title="Rename dashboard"
      confirm="Rename"
      confirmDisabled={!name.trim()}
      onConfirm={() => {
        useDashboardStore.getState().rename(name);
        onClose();
      }}
      onClose={onClose}
      className="w-[400px] max-w-[calc(100vw-32px)]"
    >
      <Field label="Name" htmlFor="dashboard-name">
        <TextInput id="dashboard-name" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} data-autofocus />
      </Field>
    </Dialog>
  );
}
