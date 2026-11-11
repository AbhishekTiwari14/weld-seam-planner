export interface WorkflowStepperProps {
  hasModel: boolean;
  seamCount: number;
  isDrafting: boolean;
  hasSelectedSeam: boolean;
  allConfigured: boolean;
  isReviewing: boolean;
  reviewBlocked: boolean;
  onOpenReview?: () => void;
  onReplaceModel?: () => void;
}

export function WorkflowStepper({
  hasModel,
  seamCount,
  isDrafting,
  hasSelectedSeam,
  allConfigured,
  isReviewing,
  reviewBlocked,
  onOpenReview,
  onReplaceModel,
}: WorkflowStepperProps) {
  // Determine the status of each step: 'completed' | 'active' | 'upcoming'
  const step1State = hasModel ? 'completed' : 'active';
  const step2State = !hasModel
    ? 'upcoming'
    : isDrafting || seamCount === 0
      ? 'active'
      : 'completed';
  const step3State = !hasModel || seamCount === 0
    ? 'upcoming'
    : !allConfigured
      ? 'active'
      : 'completed';
  // A committed plan already has an execution order, including a single seam.
  const step4State = hasModel && seamCount > 0 && allConfigured ? 'completed' : 'upcoming';
  const step5State = !hasModel || seamCount === 0
    ? 'upcoming'
    : isReviewing
      ? 'active'
      : allConfigured
        ? 'ready'
        : 'upcoming';

  const steps = [
    {
      num: 1,
      label: 'Import',
      sub: hasModel ? 'Loaded' : 'Choose STL',
      state: step1State,
      clickable: hasModel && Boolean(onReplaceModel),
      action: onReplaceModel,
      title: hasModel ? 'Change or replace workpiece model' : 'Import an STL model',
    },
    {
      num: 2,
      label: 'Define Seams',
      sub: isDrafting ? 'Drafting…' : seamCount > 0 ? `${seamCount} defined` : 'Add seam',
      state: step2State,
      clickable: false,
      title: 'Click points on 3D surface to author seams',
    },
    {
      num: 3,
      label: 'Configure',
      sub: seamCount === 0 ? 'Pending' : allConfigured ? 'All committed' : hasSelectedSeam ? 'Configuring…' : 'Parameters needed',
      state: step3State,
      clickable: false,
      title: 'Set travel speed, current and voltage targets',
    },
    {
      num: 4,
      label: 'Sequence',
      sub: seamCount > 1 ? `${seamCount} in order` : seamCount === 1 ? '1 seam' : 'Pending',
      state: step4State,
      clickable: false,
      title: 'Adjust execution order with sequence buttons',
    },
    {
      num: 5,
      label: 'Review & Export',
      sub: reviewBlocked ? 'Finish pending edit' : isReviewing ? 'Reviewing…' : allConfigured ? 'Ready for review' : 'Requires targets',
      state: step5State,
      clickable: allConfigured && Boolean(onOpenReview),
      action: onOpenReview,
      title: allConfigured ? 'Open engineering review and export JSON job' : 'Complete seam parameters before review',
    },
  ];

  return (
    <nav className="workflow-stepper" aria-label="Planning workflow steps">
      <ol className="stepper-list">
        {steps.map((step, idx) => (
          <li
            key={step.num}
            className={`stepper-item is-${step.state}${step.clickable ? ' is-clickable' : ''}`}
            data-step={step.num}
          >
            {step.clickable ? (
              <button
                type="button"
                className="stepper-button"
                onClick={step.action}
                disabled={step.num === 5 && reviewBlocked}
                title={step.title}
                aria-current={step.state === 'active' ? 'step' : undefined}
                aria-label={`Step ${step.num}: ${step.label} (${step.sub})`}
              >
                <span className="stepper-number">{step.state === 'completed' ? '✓' : step.num}</span>
                <span className="stepper-text">
                  <strong>{step.label}</strong>
                  <small>{step.sub}</small>
                </span>
              </button>
            ) : (
              <div
                className="stepper-static"
                title={step.title}
                aria-current={step.state === 'active' ? 'step' : undefined}
              >
                <span className="stepper-number">{step.state === 'completed' ? '✓' : step.num}</span>
                <span className="stepper-text">
                  <strong>{step.label}</strong>
                  <small>{step.sub}</small>
                </span>
              </div>
            )}
            {idx < steps.length - 1 && <span className="stepper-divider" aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
