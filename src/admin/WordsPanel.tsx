import { useState } from 'react';
import type { AdminState } from '../../shared/types';
import { AddWordForm } from './words/AddWordForm';
import { ChainList } from './words/ChainList';
import { WordSearch } from './words/WordSearch';

export function WordsPanel({ state }: { state: AdminState }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-4">
      <WordSearch refreshKey={refreshKey} />
      <AddWordForm onAdded={() => setRefreshKey((k) => k + 1)} />
      <ChainList chain={state.chainFull} />
    </div>
  );
}
