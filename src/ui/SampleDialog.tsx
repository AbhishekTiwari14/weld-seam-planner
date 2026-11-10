import { useEffect, useRef } from 'react';
import { SAMPLE_MODELS, type SampleModel } from '../samples/manifest.ts';
import { SampleIcon } from './SampleIcons.tsx';

export function SampleDialog({
  onSelectSample,
  onClose,
  unsaved = false,
}: {
  onSelectSample: (sample: SampleModel) => void;
  onClose: () => void;
  unsaved?: boolean;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="import-dialog sample-dialog"
      aria-labelledby="sample-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <span className="eyebrow">BUILT-IN 3D SAMPLES</span>
      <h2 id="sample-dialog-title">Select an engineering sample.</h2>
      <p>
        Explore illustrative joint assemblies. These self-authored models load through the same worker and
        validation pipeline as uploaded STLs.
      </p>

      {unsaved && (
        <p className="notice" role="status">
          Unsaved committed changes will be lost. Cancel and download the current weld plan first if you need to keep it.
        </p>
      )}

      <div className="sample-grid">
        {SAMPLE_MODELS.map((sample) => (
          <article key={sample.id} className="sample-card" data-sample-id={sample.id}>
            <div className="sample-card-preview">
              <SampleIcon id={sample.id} />
              <span className="sample-badge">{sample.badge}</span>
            </div>
            <div className="sample-card-body">
              <h3>{sample.name}</h3>
              <p className="small muted">{sample.description}</p>
              <div className="sample-meta">
                <span>
                  <strong>Dimensions:</strong> {sample.dimensionsMm.join(' × ')} mm
                </span>
                <span>
                  <strong>Geometry:</strong> {sample.triangles.toLocaleString()} triangles
                </span>
              </div>
              <p className="sample-context small">
                <em>Joint:</em> {sample.weldingContext}
              </p>
            </div>
            <div className="sample-card-action">
              <button
                type="button"
                className="primary"
                onClick={() => onSelectSample(sample)}
                aria-label={`Load ${sample.name}`}
              >
                Load sample <span>→</span>
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
