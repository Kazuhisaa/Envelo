type Props = { kind: 'loading' | 'empty' | 'error' | 'unavailable'; message: string; retry?: () => void }

export function SectionState({ kind, message, retry }: Props) {
  return <div className={`section-state ${kind === 'error' ? 'error' : ''}`} role={kind === 'error' ? 'alert' : 'status'} aria-busy={kind === 'loading'}>
    <p>{message}</p>{retry && <button className="btn ghost compact" type="button" onClick={retry}>Try again</button>}
  </div>
}
